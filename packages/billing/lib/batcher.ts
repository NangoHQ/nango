import { Err, Ok } from '@nangohq/utils';

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
    private isProcessing: boolean;
    private timer: NodeJS.Timeout | null;

    constructor(
        process: (events: T[]) => Promise<void>,
        options: {
            flushIntervalMs?: number;
            maxBatchSize: number;
            maxQueueSize?: number;
            maxProcessingRetry?: number;
        }
    ) {
        this.process = process;
        this.maxBatchSize = options.maxBatchSize;
        this.maxQueueSize = options.maxQueueSize ?? Infinity;
        this.flushInterval = options.flushIntervalMs ?? 0;
        this.maxProcessingRetry = options.maxProcessingRetry ?? 3;
        this.queue = [];
        this.isProcessing = false;

        this.timer = this.flushInterval > 0 ? setInterval(() => this.flush(), this.flushInterval) : null;
    }

    public add(...t: T[]): Result<void> {
        // Discard items if over maxQueueSize
        let discarded = 0;
        if (this.queue.length + t.length > this.maxQueueSize) {
            const remaining = this.maxQueueSize - this.queue.length;
            discarded = t.length - remaining;
            t = t.slice(0, remaining);
        }

        this.queue.push(...t.map((item) => ({ item, retries: 0 })));

        // Auto-flush if batch size threshold is reached
        if (this.queue.length >= this.maxBatchSize) {
            void this.flush();
        }

        if (discarded > 0) {
            return Err(new Error(`Batcher is full. ${discarded} items are being discarded.`));
        }

        return Ok(undefined);
    }

    public async flush(): Promise<Result<void>> {
        if (this.isProcessing) {
            return Ok(undefined);
        }

        if (this.queue.length === 0) {
            return Ok(undefined);
        }

        this.isProcessing = true;

        const batchToSend = this.queue.splice(0, Math.min(this.queue.length, this.maxBatchSize));

        try {
            await this.process(batchToSend.map((data) => data.item));

            if (this.queue.length >= this.maxBatchSize) {
                setImmediate(() => this.flush());
            }
            return Ok(undefined);
        } catch (err) {
            // Put failed items back at the front of the queue
            // unless they have been retried too many times
            const batchToRetry = batchToSend.filter((item) => item.retries < this.maxProcessingRetry).map((item) => ({ ...item, retries: item.retries + 1 }));
            this.queue.unshift(...batchToRetry);

            return Err(new Error('Batcher failed to process batch', { cause: err }));
        } finally {
            this.isProcessing = false;
        }
    }

    public async shutdown({ timeoutMs }: { timeoutMs: number } = { timeoutMs: 30_000 }): Promise<Result<void>> {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        const start = Date.now();
        while (true) {
            // check if we are over the timeout
            if (Date.now() - start > timeoutMs) {
                return Err(new Error('Batcher shutdown timed out'));
            }
            // processing is in progress, wait and loop again
            if (this.isProcessing) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                continue;
            }

            // queue is empty, we are done
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
