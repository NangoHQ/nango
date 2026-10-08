import { metrics, report } from '@nangohq/utils';

import * as concurrencyMetrics from '../../models/concurrencyMetrics.js';
import { meterConcurrency } from '../../models/tasks.js';
import { logger } from '../../utils/logger.js';
import { SchedulerDaemon } from '../daemon.js';

import type { Knex } from 'knex';

export class ConcurrencySamplingDaemon extends SchedulerDaemon {
    private readonly schema: string;
    private readonly queryTimeoutMs: number;
    private collecting = false;

    constructor({
        db,
        schema,
        abortSignal,
        tickIntervalMs,
        queryTimeoutMs
    }: {
        db: Knex;
        schema: string;
        abortSignal: AbortSignal;
        tickIntervalMs: number;
        queryTimeoutMs: number;
    }) {
        super({
            name: 'ConcurrencySampling',
            db,
            abortSignal,
            tickIntervalMs,
            continueOnError: true,
            onError: (err) => {
                logger.error('Concurrency sampling failed', err);
                report(err);
            }
        });
        this.schema = schema;
        this.queryTimeoutMs = queryTimeoutMs;
    }

    async run(now?: Date): Promise<void> {
        if (this.collecting) return;
        this.collecting = true;
        const startedAt = performance.now();
        let succeeded = true;
        try {
            const metricsCount = await this.db.transaction((trx) => this.meter(trx, now));
            metrics.increment(metrics.Types.ORCH_CONCURRENCY_SAMPLING_METRICS_COUNT, metricsCount);
        } catch (err) {
            succeeded = false;
            throw err;
        } finally {
            this.collecting = false;
            metrics.duration(metrics.Types.ORCH_CONCURRENCY_SAMPLING_DURATION_MS, performance.now() - startedAt, { success: String(succeeded) });
        }
    }

    private async meter(trx: Knex.Transaction, now?: Date): Promise<number> {
        await this.configureTimeouts(trx);
        if (!(await this.tryAcquireCollectionLock(trx))) return 0;

        // Resolve the bucket once, from the DB clock, and write to exactly the bucket we checked.
        // Recomputing it later (e.g. at insert time) could cross into the next bucket, leaving this one
        // empty and making the next tick skip it as already collected.
        const bucketStart = await this.getBucketStart(trx, now);
        if (await concurrencyMetrics.isBucketCollected(trx, bucketStart)) return 0;

        const metrics = await meterConcurrency(trx, { bucketStart });
        await concurrencyMetrics.insert(trx, metrics);
        return metrics.length;
    }

    private async configureTimeouts(trx: Knex.Transaction): Promise<void> {
        await trx.raw("SELECT set_config('statement_timeout', ?, true), set_config('lock_timeout', '100ms', true)", [String(this.queryTimeoutMs)]);
    }

    private async tryAcquireCollectionLock(trx: Knex.Transaction): Promise<boolean> {
        const { rows } = await trx.raw<{ rows: { locked: boolean }[] }>('SELECT pg_try_advisory_xact_lock(hashtext(?), hashtext(?)) AS locked', [
            this.schema,
            'concurrency_metrics_sampling'
        ]);
        return rows[0]?.locked ?? false;
    }

    private async getBucketStart(trx: Knex.Transaction, now?: Date): Promise<Date> {
        const { rows } = await trx.raw<{ rows: { now: Date }[] }>('SELECT COALESCE(?::timestamptz, clock_timestamp()) AS now', [now ?? null]);
        const timestamp = rows[0]?.now.getTime();
        if (timestamp === undefined || !Number.isFinite(timestamp)) throw new Error('Concurrency sampling: failed to resolve metering timestamp');
        const elapsedInBucketMs = timestamp % this.tickIntervalMs;
        return new Date(timestamp - elapsedInBucketMs);
    }
}
