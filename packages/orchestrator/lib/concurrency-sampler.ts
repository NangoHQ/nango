import { hostedTelemetry } from '@nangohq/hosted-telemetry';
import { cancellableDaemon, isCloud, metrics, stringifyError } from '@nangohq/utils';

import { GROUP_PREFIX_SEPARATOR } from './scheduler-config.js';
import { logger } from './utils.js';

import type { Scheduler } from '@nangohq/scheduler';

interface ConcurrencySamplerOptions {
    scheduler: Scheduler;
    tickIntervalMs: number;
    queryTimeoutMs: number;
    onError: (err: Error) => void;
}

export function environmentIdFromGroupKey(groupKey: string): number | null {
    const segments = groupKey.split(GROUP_PREFIX_SEPARATOR);
    const index = segments.indexOf('environment');
    const id = index === -1 ? undefined : segments[index + 1];
    return id && /^\d+$/.test(id) ? Number(id) : null;
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
        const res = await this.scheduler.monitoring.concurrencyPerGroup({ queryTimeoutMs: this.queryTimeoutMs });
        metrics.duration(metrics.Types.ORCH_CONCURRENCY_SAMPLING_DURATION_MS, performance.now() - startedAt, { success: String(res.isOk()) });
        if (res.isErr()) {
            logger.error(`ConcurrencySampler: ${stringifyError(res.error)}`);
            return;
        }
        const perEnvironment = new Map<number, number>();
        for (const [groupKey, count] of res.value) {
            const environmentId = environmentIdFromGroupKey(groupKey);
            if (environmentId !== null) {
                perEnvironment.set(environmentId, (perEnvironment.get(environmentId) ?? 0) + count);
            }
        }
        for (const [environmentId, concurrency] of perEnvironment) {
            if (isCloud) {
                metrics.distribution(metrics.Types.ORCH_CONCURRENCY_ACTIVE, concurrency, { environmentId });
            } else {
                // Self-hosted and BYOC concurrency metrics go to the hosted telemetry store.
                hostedTelemetry.histogram('nango.hosted_metric.active_concurrency', concurrency, { environment_id: environmentId });
            }
        }
    }
}
