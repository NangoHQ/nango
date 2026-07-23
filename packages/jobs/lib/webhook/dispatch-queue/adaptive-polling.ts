import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers/promises';

import { metrics } from '@nangohq/utils';

const DEFAULT_DECAY_WINDOW_MS = 5 * 60 * 1000;
const JITTER_RATIO = 0.2;

export interface DispatchPollPacer {
    wait(signal: AbortSignal): Promise<void>;
    recordSuccess(durationMs: number): void;
    recordCongestion(retryAfterMs: number): void;
    recordFailure(durationMs: number): void;
}

interface LocalAdaptivePollPacerOptions {
    maxDelayMs: number;
    healthyLatencyMs: number;
    decayWindowMs?: number;
    now?: () => number;
    random?: () => number;
    sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}

export class LocalAdaptivePollPacer implements DispatchPollPacer {
    private readonly maxDelayMs: number;
    private readonly healthyLatencyMs: number;
    private readonly decayWindowMs: number;
    private readonly now: () => number;
    private readonly random: () => number;
    private readonly sleep: (delayMs: number, signal: AbortSignal) => Promise<void>;
    private pressure = 0;
    private lastUpdatedAt: number;
    private backoffUntil = 0;

    constructor(options: LocalAdaptivePollPacerOptions) {
        if (!Number.isFinite(options.maxDelayMs) || options.maxDelayMs < 0) {
            throw new Error('Webhook dispatch maximum poll delay must be non-negative');
        }
        if (!Number.isFinite(options.healthyLatencyMs) || options.healthyLatencyMs <= 0) {
            throw new Error('Webhook dispatch healthy latency must be positive');
        }
        if (options.decayWindowMs !== undefined && (!Number.isFinite(options.decayWindowMs) || options.decayWindowMs <= 0)) {
            throw new Error('Webhook dispatch poll delay decay window must be positive');
        }

        this.maxDelayMs = options.maxDelayMs;
        this.healthyLatencyMs = options.healthyLatencyMs;
        this.decayWindowMs = options.decayWindowMs ?? DEFAULT_DECAY_WINDOW_MS;
        this.now = options.now ?? (() => performance.now());
        this.random = options.random ?? Math.random;
        this.sleep = options.sleep ?? (async (delayMs, signal) => await setTimeout(delayMs, undefined, { signal }));
        this.lastUpdatedAt = this.now();
    }

    async wait(signal: AbortSignal): Promise<void> {
        while (!signal.aborted) {
            const now = this.now();
            this.decay(now);
            const observedBackoffUntil = this.backoffUntil;
            const adaptiveCeilingMs = this.pressure * this.maxDelayMs;
            const adaptiveDelayMs = adaptiveCeilingMs * (1 - JITTER_RATIO + this.random() * JITTER_RATIO);
            const backoffRemainingMs = Math.max(0, observedBackoffUntil - now);
            const backoffJitterMs = backoffRemainingMs > 0 ? this.random() * backoffRemainingMs * JITTER_RATIO : 0;
            const delayMs = Math.ceil(Math.max(adaptiveDelayMs, backoffRemainingMs + backoffJitterMs));

            metrics.gauge(metrics.Types.WEBHOOK_DISPATCH_POLL_DELAY_MS, delayMs);
            metrics.gauge(metrics.Types.WEBHOOK_DISPATCH_POLL_PRESSURE, this.pressure);
            if (delayMs === 0) {
                return;
            }
            await this.sleep(delayMs, signal);
            if (this.backoffUntil <= observedBackoffUntil || this.backoffUntil <= this.now()) {
                return;
            }
        }
    }

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

    recordCongestion(retryAfterMs: number): void {
        const now = this.now();
        this.decay(now);
        this.pressure = 1;
        this.backoffUntil = Math.max(this.backoffUntil, now + Math.max(0, retryAfterMs));
        metrics.increment(metrics.Types.WEBHOOK_DISPATCH_POLL_BACKOFF, 1, { reason: 'admission' });
        metrics.gauge(metrics.Types.WEBHOOK_DISPATCH_POLL_PRESSURE, this.pressure);
    }

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

    private pressureForLatency(durationMs: number): number {
        const normalizedLatency = durationMs / this.healthyLatencyMs - 1;
        return Math.max(0, 2 / (1 + Math.exp(-normalizedLatency)) - 1);
    }

    private decay(now: number): void {
        const elapsedMs = Math.max(0, now - this.lastUpdatedAt);
        if (elapsedMs > 0) {
            // A pressure signal retains only 1% of its weight after the five-minute window.
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
