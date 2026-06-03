import { cancellableDaemon, metrics, stringifyError } from '@nangohq/utils';

import { GROUP_PREFIX_SEPARATOR } from './scheduler-config.js';
import { logger } from './utils.js';

import type { Scheduler } from '@nangohq/scheduler';

interface BackpressureMonitorOptions {
    scheduler: Scheduler;
    tickIntervalMs: number;
    topN: number;
    onError: (err: Error) => void;
}

export class BackpressureMonitor {
    private readonly scheduler: Scheduler;
    private readonly tickIntervalMs: number;
    private readonly topN: number;
    private readonly onError: (err: Error) => void;
    private daemon: ReturnType<typeof cancellableDaemon> | null = null;

    constructor({ scheduler, tickIntervalMs, topN, onError }: BackpressureMonitorOptions) {
        if (!Number.isInteger(tickIntervalMs) || tickIntervalMs < 0) {
            throw new Error(`BackpressureMonitor: tickIntervalMs must be a non-negative integer, got ${String(tickIntervalMs)}`);
        }
        this.scheduler = scheduler;
        this.tickIntervalMs = tickIntervalMs;
        this.topN = topN;
        this.onError = onError;
    }

    start(): void {
        if (this.daemon) {
            return;
        }
        this.daemon = cancellableDaemon({
            tickIntervalMs: this.tickIntervalMs,
            tick: () => this.run(),
            onError: (err) => this.onError(new Error('BackpressureMonitor error', { cause: err }))
        });
    }

    async stop(): Promise<void> {
        await this.daemon?.abort();
        this.daemon = null;
    }

    async run(): Promise<void> {
        const res = await this.scheduler.monitoring.backpressure({ limit: this.topN });
        if (res.isErr()) {
            logger.error(`BackpressureMonitor: ${stringifyError(res.error)}`);
            return;
        }
        for (const { groupKey, queued } of res.value) {
            const primitive = groupKey.split(GROUP_PREFIX_SEPARATOR)[0]!;
            metrics.gauge(metrics.Types.ORCH_QUEUE_BACKPRESSURE, queued, { groupKey, primitive });
        }
    }
}
