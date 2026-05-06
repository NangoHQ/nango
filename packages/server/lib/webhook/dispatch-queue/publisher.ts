import { SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import tracer from 'dd-trace';

import { metrics } from '@nangohq/utils';

import { runWithConcurrencyLimit } from '../runWithConcurrencyLimit.js';

import type { SQSClient, SendMessageBatchCommandOutput, SendMessageBatchRequestEntry } from '@aws-sdk/client-sqs';
import type { WebhookDispatchMessage } from '@nangohq/types';

const SQS_BATCH_MAX_ENTRIES = 10;
const DEFAULT_PUBLISH_CONCURRENCY = 10;

export interface DispatchQueuePublisherProps {
    sqs: SQSClient;
    queueUrl: string;
    /** Max entries per SQS SendMessageBatch request. AWS caps this at 10. */
    batchSize?: number;
    /** Max concurrent SQS SendMessageBatch requests. Defaults to 10. */
    publishConcurrency?: number;
}

export interface PublishResult {
    enqueued: number;
    failed: number;
}

interface BatchPublishResult extends PublishResult {
    retriedEntries: number;
}

export class DispatchQueuePublisher {
    private readonly sqs: SQSClient;
    private readonly queueUrl: string;
    private readonly batchSize: number;
    private readonly publishConcurrency: number;

    constructor(props: DispatchQueuePublisherProps) {
        this.sqs = props.sqs;
        this.queueUrl = props.queueUrl;
        const configuredBatchSize = props.batchSize ?? SQS_BATCH_MAX_ENTRIES;
        if (configuredBatchSize < 1) {
            throw new RangeError(`batchSize must be > 0`);
        }
        this.batchSize = Math.min(configuredBatchSize, SQS_BATCH_MAX_ENTRIES);

        const configuredPublishConcurrency = props.publishConcurrency ?? DEFAULT_PUBLISH_CONCURRENCY;
        if (configuredPublishConcurrency < 1) {
            throw new RangeError(`publishConcurrency must be > 0`);
        }
        this.publishConcurrency = configuredPublishConcurrency;
    }

    /**
     * Publish a list of dispatch messages in batches. Batches are fired in parallel up to
     * `publishConcurrency`; failed entries within a batch are retried once inline. Any
     * entries still failing after the retry are counted as `failed`. Regular SQS send
     * failures and partial failures are returned in the counts instead of throwing so the
     * caller can treat them as a metric/trace concern, not an HTTP 500 (provider retries
     * are worse).
     */
    async publish(messages: WebhookDispatchMessage[], messageGroupId: string): Promise<PublishResult> {
        if (messages.length === 0) {
            return { enqueued: 0, failed: 0 };
        }

        const activeSpan = tracer.scope().active();
        const firstMessage = messages[0]!;
        const batches = chunk(messages, this.batchSize);
        const span = tracer.startSpan('webhook.dispatch.publish', {
            ...(activeSpan ? { childOf: activeSpan } : {}),
            tags: {
                'nango.accountId': firstMessage.accountId,
                'nango.environmentId': firstMessage.connection.environment_id,
                'nango.integrationId': firstMessage.integrationId,
                'nango.provider': firstMessage.provider,
                'nango.providerConfigKey': firstMessage.connection.provider_config_key,
                'nango.messageCount': messages.length,
                'nango.batchCount': batches.length
            }
        });

        return await tracer.scope().activate(span, async () => {
            try {
                const results = await runWithConcurrencyLimit(batches, this.publishConcurrency, async (batch) => {
                    return await this.sendBatch(batch, messageGroupId);
                });

                const enqueued = results.reduce((sum, r) => sum + r.enqueued, 0);
                const failed = results.reduce((sum, r) => sum + r.failed, 0);
                const retriedEntries = results.reduce((sum, r) => sum + r.retriedEntries, 0);
                const retriedBatches = results.filter((r) => r.retriedEntries > 0).length;

                span.setTag('nango.enqueued', enqueued);
                span.setTag('nango.failed', failed);
                span.setTag('nango.retriedEntries', retriedEntries);
                span.setTag('nango.retriedBatches', retriedBatches);

                const provider = firstMessage.provider;

                if (enqueued > 0) {
                    metrics.increment(metrics.Types.WEBHOOK_DISPATCH_PUBLISH_SUCCESS, enqueued, { provider });
                }
                if (failed > 0) {
                    const error = new Error(`Failed to enqueue ${failed} webhook dispatch message${failed === 1 ? '' : 's'}`);
                    span.setTag('error', error);
                    span.setTag('nango.partialFailure', true);

                    metrics.increment(metrics.Types.WEBHOOK_DISPATCH_PUBLISH_FAILURE, failed, { provider });
                }

                return { enqueued, failed };
            } catch (err) {
                span.setTag('error', err);
                throw err;
            } finally {
                span.finish();
            }
        });
    }

    private async sendBatch(batch: WebhookDispatchMessage[], messageGroupId: string): Promise<BatchPublishResult> {
        const entries = batch.map((message, idx) => toEntry(message, idx, messageGroupId));

        const first = await this.trySend(entries);
        const failedIndices = first.failedIds.map((id) => entryIdToIndex(id));
        if (failedIndices.length === 0) {
            return { enqueued: batch.length, failed: 0, retriedEntries: 0 };
        }

        const retryEntries = failedIndices.map((i) => entries[i]).filter((e): e is SendMessageBatchRequestEntry => e !== undefined);
        const second = await this.trySend(retryEntries);

        const enqueued = batch.length - second.failedIds.length;
        return { enqueued, failed: second.failedIds.length, retriedEntries: failedIndices.length };
    }

    private async trySend(entries: SendMessageBatchRequestEntry[]): Promise<{ failedIds: string[] }> {
        if (entries.length === 0) return { failedIds: [] };
        try {
            const response: SendMessageBatchCommandOutput = await this.sqs.send(new SendMessageBatchCommand({ QueueUrl: this.queueUrl, Entries: entries }));
            const failedIds = (response.Failed ?? []).map((f) => f.Id).filter((id): id is string => typeof id === 'string');
            return { failedIds };
        } catch (err) {
            tracer.scope().active()?.setTag('sqs.send.error', err);
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
