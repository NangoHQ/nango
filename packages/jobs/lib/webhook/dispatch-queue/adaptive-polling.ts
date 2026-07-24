import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers/promises';

import { metrics } from '@nangohq/utils';

export interface DispatchPollPacer {
    wait(signal: AbortSignal): Promise<void>;
    waitForBackoff(signal: AbortSignal): Promise<void>;
    recordCongestion(retryAfterMs: number, durationMs: number): void;
    recordFailure(durationMs: number): void;
    recordSuccess(durationMs: number): void;
}

interface LocalAdaptivePollPacerOptions {
    maxDelayMs: number;
    healthyLatencyMs: number;
    decayWindowMs: number;
    jitterRatio: number;
    now?: () => number;
    random?: () => number;
    sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}

/**
 * Converts pod-local orchestrator outcomes into a shared delay for all SQS poll loops.
 * Pressure rises immediately on slow calls or failures, then decays toward zero while explicit admission backoff is enforced separately.
 */
export class LocalAdaptivePollPacer implements DispatchPollPacer {
    /** Maximum latency-driven delay applied before an SQS receive. */
    private readonly maxDelayMs: number;
    /** Orchestrator latency where the one-sided sigmoid starts producing pressure. */
    private readonly healthyLatencyMs: number;
    /** Time after which a pressure signal retains only one percent of its original weight. */
    private readonly decayWindowMs: number;
    /** Fraction of each delay randomized to desynchronize loops and pods. */
    private readonly jitterRatio: number;
    private readonly now: () => number;
    private readonly random: () => number;
    private readonly sleep: (delayMs: number, signal: AbortSignal) => Promise<void>;
    /** Current normalized load signal, from zero for healthy to one for fully paced. */
    private pressure = 0;
    private lastUpdatedAt: number;
    /** Monotonic deadline through which orchestrator admission asked this pod to stop dispatching. */
    private backoffUntil = 0;

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
        if (!Number.isFinite(options.decayWindowMs) || options.decayWindowMs <= 0) {
            throw new Error('Webhook dispatch poll delay decay window must be positive');
        }
        if (!Number.isFinite(options.jitterRatio) || options.jitterRatio < 0 || options.jitterRatio > 1) {
            throw new Error('Webhook dispatch poll delay jitter ratio must be between zero and one');
        }

        this.maxDelayMs = options.maxDelayMs;
        this.healthyLatencyMs = options.healthyLatencyMs;
        this.decayWindowMs = options.decayWindowMs;
        this.jitterRatio = options.jitterRatio;
        this.now = options.now ?? (() => performance.now());
        this.random = options.random ?? Math.random;
        this.sleep = options.sleep ?? (async (delayMs, signal) => await setTimeout(delayMs, undefined, { signal }));
        this.lastUpdatedAt = this.now();
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
     * 1. Ignore adaptive pressure to avoid double pacing. 2. Wait only for explicit admission backoff and peer-loop extensions.
     */
    async waitForBackoff(signal: AbortSignal): Promise<void> {
        await this.waitUntilAllowed(signal, false);
    }

    /**
     * Applies orchestrator admission feedback.
     * 1. Decay old pressure. 2. Force full pressure. 3. Extend Retry-After. 4. Record latency and backoff metrics.
     */
    recordCongestion(retryAfterMs: number, durationMs: number): void {
        const now = this.now();
        this.decay(now);
        this.pressure = 1;
        const validRetryAfterMs = Number.isFinite(retryAfterMs) ? Math.max(0, retryAfterMs) : 0;
        this.backoffUntil = Math.max(this.backoffUntil, now + validRetryAfterMs);
        if (Number.isFinite(durationMs) && durationMs >= 0) {
            metrics.duration(metrics.Types.WEBHOOK_DISPATCH_ORCHESTRATOR_LATENCY_MS, durationMs);
        }
        metrics.increment(metrics.Types.WEBHOOK_DISPATCH_POLL_BACKOFF, 1, { reason: 'admission' });
        metrics.gauge(metrics.Types.WEBHOOK_DISPATCH_POLL_PRESSURE, this.pressure);
    }

    /**
     * Applies generic orchestrator failure feedback.
     * 1. Decay old pressure. 2. Force full pressure. 3. Record latency and failure backoff metrics.
     */
    recordFailure(durationMs: number): void {
        const now = this.now();
        this.decay(now);
        this.pressure = 1;
        if (Number.isFinite(durationMs) && durationMs >= 0) {
            metrics.duration(metrics.Types.WEBHOOK_DISPATCH_ORCHESTRATOR_LATENCY_MS, durationMs);
        }
        metrics.increment(metrics.Types.WEBHOOK_DISPATCH_POLL_BACKOFF, 1, { reason: 'failure' });
        metrics.gauge(metrics.Types.WEBHOOK_DISPATCH_POLL_PRESSURE, this.pressure);
    }

    /**
     * Applies a successful orchestrator latency sample.
     * 1. Decay old pressure. 2. Map latency through the sigmoid. 3. Keep the stronger signal and record metrics.
     */
    recordSuccess(durationMs: number): void {
        if (!Number.isFinite(durationMs) || durationMs < 0) {
            return;
        }

        const now = this.now();
        this.decay(now);
        this.pressure = Math.max(this.pressure, this.pressureForLatency(durationMs));
        metrics.duration(metrics.Types.WEBHOOK_DISPATCH_ORCHESTRATOR_LATENCY_MS, durationMs);
        metrics.gauge(metrics.Types.WEBHOOK_DISPATCH_POLL_PRESSURE, this.pressure);
    }

    /**
     * Executes the shared wait algorithm.
     * 1. Snapshot and decay state. 2. Calculate bounded jitter. 3. Sleep. 4. Repeat only for a live deadline extension.
     */
    private async waitUntilAllowed(signal: AbortSignal, includeAdaptiveDelay: boolean): Promise<void> {
        while (!signal.aborted) {
            const now = this.now();
            this.decay(now);
            const observedBackoffUntil = this.backoffUntil;
            const adaptiveCeilingMs = includeAdaptiveDelay ? this.pressure * this.maxDelayMs : 0;
            const adaptiveDelayMs = adaptiveCeilingMs * (1 - this.jitterRatio + this.random() * this.jitterRatio);
            const backoffRemainingMs = Math.max(0, observedBackoffUntil - now);
            const backoffJitterMs = backoffRemainingMs > 0 ? this.random() * backoffRemainingMs * this.jitterRatio : 0;
            const delayMs = Math.ceil(Math.max(adaptiveDelayMs, backoffRemainingMs + backoffJitterMs));

            if (includeAdaptiveDelay || backoffRemainingMs > 0) {
                metrics.gauge(metrics.Types.WEBHOOK_DISPATCH_POLL_DELAY_MS, delayMs);
            }
            if (delayMs === 0) {
                return;
            }
            await this.sleep(delayMs, signal);
            if (this.backoffUntil <= observedBackoffUntil || this.backoffUntil <= this.now()) {
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

    /**
     * Recovers local polling capacity over time.
     * 1. Apply exponential decay for elapsed time. 2. Drop sub-millisecond pressure. 3. Clear expired admission backoff.
     */
    private decay(now: number): void {
        const elapsedMs = Math.max(0, now - this.lastUpdatedAt);
        if (elapsedMs > 0) {
            this.pressure *= Math.exp((-Math.log(100) * elapsedMs) / this.decayWindowMs);
            if (this.pressure * this.maxDelayMs < 1) {
                this.pressure = 0;
            }
            this.lastUpdatedAt = now;
        }
        if (this.backoffUntil <= now) {
            this.backoffUntil = 0;
        }
    }
}
