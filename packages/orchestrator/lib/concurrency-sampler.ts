import { cancellableDaemon, metrics, stringifyError } from '@nangohq/utils';

import { logger } from './utils.js';

import type { Scheduler } from '@nangohq/scheduler';

interface ConcurrencySamplerOptions {
    scheduler: Scheduler;
    tickIntervalMs: number;
    queryTimeoutMs: number;
    onError: (err: Error) => void;
}

export class ConcurrencySampler {
    private readonly scheduler: Scheduler;
    private readonly tickIntervalMs: number;
    private readonly queryTimeoutMs: number;
    private readonly onError: (err: Error) => void;
    private daemon: ReturnType<typeof cancellableDaemon> | null = null;

    constructor({ scheduler, tickIntervalMs, queryTimeoutMs, onError }: ConcurrencySamplerOptions) {
        if (!Number.isInteger(tickIntervalMs) || tickIntervalMs < 0) {
            throw new Error(`ConcurrencySampler: tickIntervalMs must be a non-negative integer, got ${String(tickIntervalMs)}`);
        }
        this.scheduler = scheduler;
        this.tickIntervalMs = tickIntervalMs;
        this.queryTimeoutMs = queryTimeoutMs;
        this.onError = onError;
    }

    start(): void {
        if (this.daemon) {
            return;
        }
        this.daemon = cancellableDaemon({
            tickIntervalMs: this.tickIntervalMs,
            tick: () => this.run(),
            onError: (err) => this.onError(new Error('ConcurrencySampler error', { cause: err }))
        });
    }

    async stop(): Promise<void> {
        await this.daemon?.abort();
        this.daemon = null;
    }

    async run(): Promise<void> {
        const startedAt = performance.now();
        const res = await this.scheduler.monitoring.concurrency({ queryTimeoutMs: this.queryTimeoutMs });
        metrics.duration(metrics.Types.ORCH_CONCURRENCY_SAMPLING_DURATION_MS, performance.now() - startedAt, { success: String(res.isOk()) });
        if (res.isErr()) {
            logger.error(`ConcurrencySampler: ${stringifyError(res.error)}`);
            return;
        }
        for (const { environmentId, concurrency } of res.value) {
            metrics.distribution(metrics.Types.ORCH_CONCURRENCY_ACTIVE, concurrency, { environmentId });
        }
    }
}
