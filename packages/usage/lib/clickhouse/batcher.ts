import { randomUUID } from 'crypto';

import { Err, Ok, metrics } from '@nangohq/utils';

import { logger } from '../logger.js';

import type { Result } from '@nangohq/utils';

export class Batcher<T> {
    private readonly process: (events: T[], opts: { retryKey: string }) => Promise<void>;
    private readonly maxBatchSize: number;
    private readonly flushInterval: number;
    private queue: T[];
    private readonly maxQueueSize: number;
    private readonly maxProcessingRetry: number;
    private isFlushing: boolean;
    private timer: NodeJS.Timeout | null;
    // Retry state for the most recent failed batch. Tracked at batch level since only one
    // batch is ever in flight at a time (gated by `isFlushing`). On retry, we splice exactly
    // `size` items from the front (where the failed batch was unshifted), so the next
    // flush sends the same items as the original attempt with the same `key`. Cleared on
    // success or when retries are exhausted.
    private retry: { key: string; size: number; attempts: number } | null;

    constructor(options: {
        process: (events: T[], opts: { retryKey: string }) => Promise<void>;
        flushIntervalMs?: number;
        maxBatchSize: number;
        maxQueueSize?: number;
        maxProcessingRetry?: number;
    }) {
        this.process = options.process;
        this.maxBatchSize = options.maxBatchSize;
        this.maxQueueSize = options.maxQueueSize ?? Infinity;
        this.flushInterval = options.flushIntervalMs ?? 0;
        this.maxProcessingRetry = options.maxProcessingRetry ?? 3;
        this.queue = [];
        this.isFlushing = false;
        this.retry = null;

        this.timer = this.flushInterval > 0 ? setInterval(() => this.flush(), this.flushInterval) : null;
        this.timer?.unref();
    }

    public add(...t: T[]): Result<void> {
        if (t.length === 0) {
            return Ok(undefined);
        }
        let discarded = 0;
        if (this.queue.length + t.length > this.maxQueueSize) {
            const remaining = this.maxQueueSize - this.queue.length;
            discarded = t.length - remaining;
            t = t.slice(0, remaining);
        }

        if (discarded > 0) {
            logger.error(`Clickhouse batcher queue full. Discarding ${discarded} items.`);
            metrics.increment(metrics.Types.BILLING_USAGE_CLICKHOUSE_BATCHER_INGEST_RESULT, discarded, { success: 'false', reason: 'queue_full' });
        }

        this.queue.push(...t);

        if (this.queue.length >= this.maxBatchSize) {
            void this.flush();
        }

        if (discarded > 0) {
            return Err(new Error(`Clickhouse batcher is full. ${discarded} items are being discarded.`));
        }

        return Ok(undefined);
    }

    public async flush(): Promise<Result<void>> {
        if (this.isFlushing) {
            return Ok(undefined);
        }

        if (this.queue.length === 0) {
            return Ok(undefined);
        }

        this.isFlushing = true;

        // If a previous batch failed, take exactly its items off the front (they were
        // unshifted there). Otherwise take up to maxBatchSize fresh items. This isolates
        // retried items from any fresh items added since the failure.
        const sliceSize = this.retry?.size ?? Math.min(this.queue.length, this.maxBatchSize);
        const batch = this.queue.splice(0, sliceSize);

        // retryKey is stable across retries of the same logical batch so CH server-side
        // dedup catches a retried INSERT even if the block content drifts.
        const retryKey = this.retry?.key ?? randomUUID();

        const start = process.hrtime.bigint();
        try {
            await this.process(batch, { retryKey });
            metrics.increment(metrics.Types.BILLING_USAGE_CLICKHOUSE_BATCHER_INGEST_RESULT, batch.length, { success: 'true' });

            this.retry = null;

            if (this.queue.length >= this.maxBatchSize) {
                setImmediate(() => this.flush());
            }
            return Ok(undefined);
        } catch (err) {
            const attempts = (this.retry?.attempts ?? 0) + 1;
            if (attempts > this.maxProcessingRetry) {
                logger.error(`Clickhouse batcher: dropping ${batch.length} items after exhausting retries.`);
                metrics.increment(metrics.Types.BILLING_USAGE_CLICKHOUSE_BATCHER_INGEST_RESULT, batch.length, { success: 'false', reason: 'insert_failed' });
                this.retry = null;
            } else {
                this.queue.unshift(...batch);
                this.retry = { key: retryKey, size: batch.length, attempts };
                metrics.increment(metrics.Types.BILLING_USAGE_CLICKHOUSE_BATCHER_RETRY, 1);
            }

            return Err(new Error('Batcher failed to process batch', { cause: err }));
        } finally {
            metrics.distribution(metrics.Types.BILLING_USAGE_CLICKHOUSE_BATCHER_INGEST_DURATION_MS, Number(process.hrtime.bigint() - start) / 1e6);
            this.isFlushing = false;
        }
    }

    public async shutdown({ timeoutMs }: { timeoutMs: number } = { timeoutMs: 30_000 }): Promise<Result<void>> {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        const start = Date.now();
        while (true) {
            if (Date.now() - start > timeoutMs) {
                if (this.queue.length > 0) {
                    logger.error(`Clickhouse batcher shutdown timed out. Dropping ${this.queue.length} items.`);
                }
                return Err(new Error('Clickhouse batcher shutdown timed out'));
            }
            if (this.isFlushing) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                continue;
            }
            if (this.queue.length === 0) {
                break;
            }
            const res = await this.flush();
            if (res.isErr()) {
                return res;
            }
        }
        return Ok(undefined);
    }
}
