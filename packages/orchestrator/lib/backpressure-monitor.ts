import { setTimeout } from 'node:timers/promises';

import { metrics, stringifyError } from '@nangohq/utils';

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
    private readonly ac = new AbortController();
    private status: 'running' | 'stopped' = 'stopped';

    constructor({ scheduler, tickIntervalMs, topN, onError }: BackpressureMonitorOptions) {
        if (!Number.isInteger(tickIntervalMs) || tickIntervalMs < 0) {
            throw new Error(`BackpressureMonitor: tickIntervalMs must be a non-negative integer, got ${String(tickIntervalMs)}`);
        }
        this.scheduler = scheduler;
        this.tickIntervalMs = tickIntervalMs;
        this.topN = topN;
        this.onError = onError;
    }

    async start(): Promise<void> {
        if (this.status !== 'stopped') {
            return;
        }
        this.status = 'running';
        try {
            while (!this.ac.signal.aborted) {
                await this.run();
                await setTimeout(this.tickIntervalMs, undefined, { signal: this.ac.signal }).catch((err: unknown) => {
                    if ((err as { name?: string }).name !== 'AbortError') {
                        throw err;
                    }
                });
            }
        } catch (err) {
            this.onError(new Error('BackpressureMonitor error', { cause: err }));
        } finally {
            this.status = 'stopped';
        }
    }

    async stop(): Promise<void> {
        this.ac.abort();
        while (this.status !== 'stopped') {
            await setTimeout(100);
        }
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
