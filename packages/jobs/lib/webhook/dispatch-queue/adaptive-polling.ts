import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers/promises';

import { metrics } from '@nangohq/utils';

export interface DispatchPollPacer {
    wait(signal: AbortSignal): Promise<void>;
    waitForBackoff(signal: AbortSignal, prepareWait: (delayMs: number, signal: AbortSignal) => Promise<void>): Promise<void>;
    recordCongestion(retryAfterMs: number, durationMs: number): void;
    recordFailure(durationMs: number): void;
    recordSuccess(durationMs: number): void;
}

interface LocalAdaptivePollPacerOptions {
    maxDelayMs: number;
    healthyLatencyMs: number;
    latencyTauMs: number;
    failureBackoffMs: number;
    jitterRatio: number;
    now?: () => number;
    random?: () => number;
    sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}

/**
 * Converts pod-local orchestrator outcomes into a shared delay for all SQS poll loops.
 * Successful latency updates a smoothed pressure signal, while admission and failure backoffs are enforced separately.
 */
export class LocalAdaptivePollPacer implements DispatchPollPacer {
    /** Maximum latency-driven delay applied before an SQS receive. */
    private readonly maxDelayMs: number;
    /** Orchestrator latency where the one-sided sigmoid starts producing pressure. */
    private readonly healthyLatencyMs: number;
    /** Time constant controlling how quickly successful latency samples change pressure. */
    private readonly latencyTauMs: number;
    /** Fixed pod-local pause applied after a generic orchestrator failure. */
    private readonly failureBackoffMs: number;
    /** Fraction of each delay randomized to desynchronize loops and pods. */
    private readonly jitterRatio: number;
    private readonly now: () => number;
    private readonly random: () => number;
    private readonly sleep: (delayMs: number, signal: AbortSignal) => Promise<void>;
    /** Smoothed normalized latency signal, from zero for healthy to one for fully paced. */
    private latencyPressure = 0;
    /** Monotonic time of the previous successful latency sample. */
    private lastLatencySampleAt: number;
    /** Monotonic deadline through which orchestrator admission asked this pod to stop dispatching. */
    private admissionBackoffUntil = 0;
    /** Monotonic deadline for the short pause applied after a generic failure. */
    private failureBackoffUntil = 0;

    /**
     * Builds the pod-local controller.
     * 1. Validate each tuning input. 2. Store its dependencies. 3. Anchor decay to the monotonic clock.
     */
    constructor(options: LocalAdaptivePollPacerOptions) {
        if (!Number.isFinite(options.maxDelayMs) || options.maxDelayMs < 0) {
            throw new Error('Webhook dispatch maximum poll delay must be non-negative');
        }
        if (!Number.isFinite(options.healthyLatencyMs) || options.healthyLatencyMs <= 0) {
            throw new Error('Webhook dispatch healthy latency must be positive');
        }
        if (!Number.isFinite(options.latencyTauMs) || options.latencyTauMs <= 0) {
            throw new Error('Webhook dispatch latency EWMA time constant must be positive');
        }
        if (!Number.isFinite(options.failureBackoffMs) || options.failureBackoffMs < 0) {
            throw new Error('Webhook dispatch failure backoff must be non-negative');
        }
        if (!Number.isFinite(options.jitterRatio) || options.jitterRatio < 0 || options.jitterRatio > 1) {
            throw new Error('Webhook dispatch poll delay jitter ratio must be between zero and one');
        }

        this.maxDelayMs = options.maxDelayMs;
        this.healthyLatencyMs = options.healthyLatencyMs;
        this.latencyTauMs = options.latencyTauMs;
        this.failureBackoffMs = options.failureBackoffMs;
        this.jitterRatio = options.jitterRatio;
        this.now = options.now ?? (() => performance.now());
        this.random = options.random ?? Math.random;
        this.sleep = options.sleep ?? (async (delayMs, signal) => await setTimeout(delayMs, undefined, { signal }));
        this.lastLatencySampleAt = this.now();
    }

    /**
     * Paces the next SQS receive.
     * 1. Include both latency pressure and admission backoff. 2. Sleep with jitter. 3. Recheck extensions from peer loops.
     */
    async wait(signal: AbortSignal): Promise<void> {
        await this.waitUntilAllowed(signal, true);
    }

    /**
     * Gates an already-received batch before orchestrator dispatch.
     * 1. Ignore adaptive pressure. 2. Prepare message visibility for the exact delay. 3. Wait for backoff and peer-loop extensions.
     */
    async waitForBackoff(signal: AbortSignal, prepareWait: (delayMs: number, signal: AbortSignal) => Promise<void>): Promise<void> {
        await this.waitUntilAllowed(signal, false, prepareWait);
    }

    /**
     * Applies orchestrator admission feedback.
     * 1. Preserve latency pressure. 2. Extend Retry-After. 3. Record latency and admission-backoff metrics.
     */
    recordCongestion(retryAfterMs: number, durationMs: number): void {
        const now = this.now();
        const validRetryAfterMs = Number.isFinite(retryAfterMs) ? Math.max(0, retryAfterMs) : 0;
        this.admissionBackoffUntil = Math.max(this.admissionBackoffUntil, now + validRetryAfterMs);
        if (Number.isFinite(durationMs) && durationMs >= 0) {
            metrics.duration(metrics.Types.WEBHOOK_DISPATCH_ORCHESTRATOR_LATENCY_MS, durationMs);
        }
        metrics.increment(metrics.Types.WEBHOOK_DISPATCH_POLL_BACKOFF, 1, { reason: 'admission' });
        metrics.gauge(metrics.Types.WEBHOOK_DISPATCH_POLL_LATENCY_PRESSURE, this.latencyPressure);
    }

    /**
     * Applies generic orchestrator failure feedback.
     * 1. Preserve latency pressure. 2. Extend the fixed failure deadline. 3. Record latency and failure-backoff metrics.
     */
    recordFailure(durationMs: number): void {
        const now = this.now();
        this.failureBackoffUntil = Math.max(this.failureBackoffUntil, now + this.failureBackoffMs);
        if (Number.isFinite(durationMs) && durationMs >= 0) {
            metrics.duration(metrics.Types.WEBHOOK_DISPATCH_ORCHESTRATOR_LATENCY_MS, durationMs);
        }
        metrics.increment(metrics.Types.WEBHOOK_DISPATCH_POLL_BACKOFF, 1, { reason: 'failure' });
        metrics.gauge(metrics.Types.WEBHOOK_DISPATCH_POLL_LATENCY_PRESSURE, this.latencyPressure);
    }

    /**
     * Applies a successful orchestrator latency sample.
     * 1. Map latency through the sigmoid. 2. Blend it with a time-adaptive EWMA. 3. Record latency and pressure metrics.
     */
    recordSuccess(durationMs: number): void {
        if (!Number.isFinite(durationMs) || durationMs < 0) {
            return;
        }

        const now = this.now();
        const elapsedMs = Math.max(0, now - this.lastLatencySampleAt);
        const alpha = 1 - Math.exp(-elapsedMs / this.latencyTauMs);
        const samplePressure = this.pressureForLatency(durationMs);
        this.latencyPressure += alpha * (samplePressure - this.latencyPressure);
        if (this.latencyPressure * this.maxDelayMs < 1) {
            this.latencyPressure = 0;
        }
        this.lastLatencySampleAt = now;
        metrics.duration(metrics.Types.WEBHOOK_DISPATCH_ORCHESTRATOR_LATENCY_MS, durationMs);
        metrics.gauge(metrics.Types.WEBHOOK_DISPATCH_POLL_LATENCY_PRESSURE, this.latencyPressure);
    }

    /**
     * Executes the shared wait algorithm.
     * 1. Reject shutdown. 2. Snapshot and decay state. 3. Prepare and sleep with jitter. 4. Recheck live deadline extensions.
     */
    private async waitUntilAllowed(
        signal: AbortSignal,
        includeAdaptiveDelay: boolean,
        prepareWait?: (delayMs: number, signal: AbortSignal) => Promise<void>
    ): Promise<void> {
        while (true) {
            signal.throwIfAborted();
            const now = this.now();
            this.clearExpiredBackoffs(now);
            const observedBackoffUntil = Math.max(this.admissionBackoffUntil, this.failureBackoffUntil);
            const adaptiveCeilingMs = includeAdaptiveDelay ? this.latencyPressure * this.maxDelayMs : 0;
            const adaptiveDelayMs = adaptiveCeilingMs * (1 - this.jitterRatio + this.random() * this.jitterRatio);
            const admissionRemainingMs = Math.max(0, this.admissionBackoffUntil - now);
            const admissionJitterMs = admissionRemainingMs > 0 ? this.random() * admissionRemainingMs * this.jitterRatio : 0;
            const failureRemainingMs = Math.max(0, this.failureBackoffUntil - now);
            const delayMs = Math.ceil(Math.max(adaptiveDelayMs, admissionRemainingMs + admissionJitterMs, failureRemainingMs));

            if (includeAdaptiveDelay || observedBackoffUntil > now) {
                metrics.gauge(metrics.Types.WEBHOOK_DISPATCH_POLL_DELAY_MS, delayMs);
            }
            if (delayMs === 0) {
                return;
            }
            await prepareWait?.(delayMs, signal);
            signal.throwIfAborted();
            await this.sleep(delayMs, signal);
            const currentBackoffUntil = Math.max(this.admissionBackoffUntil, this.failureBackoffUntil);
            if (currentBackoffUntil <= observedBackoffUntil || currentBackoffUntil <= this.now()) {
                return;
            }
        }
    }

    /**
     * Converts latency into normalized pressure.
     * Values at or below the healthy threshold map to zero; slower calls approach one through a one-sided sigmoid.
     */
    private pressureForLatency(durationMs: number): number {
        const normalizedLatency = durationMs / this.healthyLatencyMs - 1;
        return Math.max(0, 2 / (1 + Math.exp(-normalizedLatency)) - 1);
    }

    /** Clears completed admission and failure deadlines before calculating the next wait. */
    private clearExpiredBackoffs(now: number): void {
        if (this.admissionBackoffUntil <= now) {
            this.admissionBackoffUntil = 0;
        }
        if (this.failureBackoffUntil <= now) {
            this.failureBackoffUntil = 0;
        }
    }
}
