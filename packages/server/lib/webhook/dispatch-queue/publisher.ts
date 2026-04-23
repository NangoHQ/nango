import { SendMessageBatchCommand } from '@aws-sdk/client-sqs';

import { getLogger, metrics } from '@nangohq/utils';

import type { SQSClient, SendMessageBatchCommandOutput, SendMessageBatchRequestEntry } from '@aws-sdk/client-sqs';
import type { WebhookDispatchMessage } from '@nangohq/types';

const logger = getLogger('DispatchQueuePublisher');

const SQS_BATCH_MAX_ENTRIES = 10;

export interface DispatchQueuePublisherProps {
    sqs: SQSClient;
    queueUrl: string;
    /** Max entries per SQS SendMessageBatch request. AWS caps this at 10. */
    batchSize?: number;
}

export interface PublishResult {
    enqueued: number;
    failed: number;
}

export class DispatchQueuePublisher {
    private readonly sqs: SQSClient;
    private readonly queueUrl: string;
    private readonly batchSize: number;

    constructor(props: DispatchQueuePublisherProps) {
        this.sqs = props.sqs;
        this.queueUrl = props.queueUrl;
        const configured = props.batchSize ?? SQS_BATCH_MAX_ENTRIES;
        this.batchSize = Math.min(configured, SQS_BATCH_MAX_ENTRIES);
    }

    /**
     * Publish a list of dispatch messages in batches. All batches are fired in parallel;
     * failed entries within a batch are retried once inline. Any entries still failing
     * after the retry are counted as `failed`. Never throws — the caller treats partial
     * failure as a metric/log concern, not an HTTP 500 (provider retries are worse).
     */
    async publish(messages: WebhookDispatchMessage[], messageGroupId: string): Promise<PublishResult> {
        if (messages.length === 0) {
            return { enqueued: 0, failed: 0 };
        }

        const batches = chunk(messages, this.batchSize);

        const results = await Promise.all(batches.map((batch) => this.sendBatch(batch, messageGroupId)));

        const enqueued = results.reduce((sum, r) => sum + r.enqueued, 0);
        const failed = results.reduce((sum, r) => sum + r.failed, 0);

        const provider = messages[0]?.provider ?? 'unknown';

        if (enqueued > 0) {
            metrics.increment(metrics.Types.WEBHOOK_DISPATCH_MESSAGES_ENQUEUED, enqueued, { provider });
            metrics.increment(metrics.Types.WEBHOOK_DISPATCH_PUBLISH_SUCCESS, enqueued, { provider });
        }
        if (failed > 0) {
            metrics.increment(metrics.Types.WEBHOOK_DISPATCH_PUBLISH_FAILURE, failed, { provider });
            logger.error(`webhook dispatch publish partial failure`, { provider, failed, enqueued, messageGroupId });
        }

        return { enqueued, failed };
    }

    private async sendBatch(batch: WebhookDispatchMessage[], messageGroupId: string): Promise<PublishResult> {
        const entries = batch.map((message, idx) => toEntry(message, idx, messageGroupId));

        const first = await this.trySend(entries);
        const failedIndices = first.failedIds.map((id) => entryIdToIndex(id));
        if (failedIndices.length === 0) {
            return { enqueued: batch.length, failed: 0 };
        }

        const retryEntries = failedIndices.map((i) => entries[i]).filter((e): e is SendMessageBatchRequestEntry => e !== undefined);
        const second = await this.trySend(retryEntries);

        const enqueued = batch.length - second.failedIds.length;
        return { enqueued, failed: second.failedIds.length };
    }

    private async trySend(entries: SendMessageBatchRequestEntry[]): Promise<{ failedIds: string[] }> {
        if (entries.length === 0) return { failedIds: [] };
        try {
            const response: SendMessageBatchCommandOutput = await this.sqs.send(new SendMessageBatchCommand({ QueueUrl: this.queueUrl, Entries: entries }));
            const failedIds = (response.Failed ?? []).map((f) => f.Id).filter((id): id is string => typeof id === 'string');
            return { failedIds };
        } catch (err) {
            logger.error(`SendMessageBatchCommand threw`, { error: err });
            return { failedIds: entries.map((e) => e.Id!).filter((id): id is string => typeof id === 'string') };
        }
    }
}

function toEntry(message: WebhookDispatchMessage, index: number, messageGroupId: string): SendMessageBatchRequestEntry {
    return {
        Id: indexToEntryId(index),
        MessageBody: JSON.stringify(message),
        MessageGroupId: messageGroupId
    };
}

function indexToEntryId(index: number): string {
    return `m${index}`;
}

function entryIdToIndex(id: string): number {
    return Number.parseInt(id.slice(1), 10);
}

function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}
