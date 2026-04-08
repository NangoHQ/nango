import { Err, Ok } from '@nangohq/utils';

import { logger } from '../logger.js';

import type { Result } from '@nangohq/utils';

interface Item<T> {
    item: T;
    retries: number;
}

export class Batcher<T> {
    private readonly process: (events: T[]) => Promise<void>;
    private readonly maxBatchSize: number;
    private readonly flushInterval: number;
    private queue: Item<T>[];
    private readonly maxQueueSize: number;
    private readonly maxProcessingRetry: number;
    private isFlushing: boolean;
    private timer: NodeJS.Timeout | null;

    constructor(options: {
        process: (events: T[]) => Promise<void>;
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
        }

        this.queue.push(...t.map((item) => ({ item, retries: 0 })));

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

        const batch = this.queue.splice(0, Math.min(this.queue.length, this.maxBatchSize));

        try {
            await this.process(batch.map((data) => data.item));

            if (this.queue.length >= this.maxBatchSize) {
                setImmediate(() => this.flush());
            }
            return Ok(undefined);
        } catch (err) {
            const batchToRetry = batch.filter((item) => item.retries < this.maxProcessingRetry).map((item) => ({ ...item, retries: item.retries + 1 }));
            const dropped = batch.length - batchToRetry.length;
            if (dropped > 0) {
                // TODO: push metric
                logger.error(`Clickhouse batcher: dropping ${dropped} items after exhausting retries.`);
            }
            this.queue.unshift(...batchToRetry);

            return Err(new Error('Batcher failed to process batch', { cause: err }));
        } finally {
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
