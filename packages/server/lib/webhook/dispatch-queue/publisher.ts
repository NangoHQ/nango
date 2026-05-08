import { SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import tracer from 'dd-trace';

import { metrics, report } from '@nangohq/utils';

import { runWithConcurrencyLimit } from '../runWithConcurrencyLimit.js';

import type { SQSClient, SendMessageBatchCommandOutput, SendMessageBatchRequestEntry } from '@aws-sdk/client-sqs';
import type { WebhookDispatchMessage } from '@nangohq/types';

const SQS_BATCH_MAX_ENTRIES = 10;
const DEFAULT_PUBLISH_CONCURRENCY = 10;
export const SQS_BATCH_MAX_BYTES = 1_048_576;

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
    failedActivityLogIds: string[];
}

export interface PreparedDispatchMessage {
    message: WebhookDispatchMessage;
    byteSize: number;
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
    async publish(messages: PreparedDispatchMessage[], messageGroupId: string): Promise<PublishResult> {
        if (messages.length === 0) {
            return { enqueued: 0, failed: 0, failedActivityLogIds: [] };
        }

        const activeSpan = tracer.scope().active();
        const firstMessage = messages[0]!.message;
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
                const failedActivityLogIds = results.flatMap((r) => r.failedActivityLogIds);
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

                return { enqueued, failed, failedActivityLogIds };
            } catch (err) {
                span.setTag('error', err);
                throw err;
            } finally {
                span.finish();
            }
        });
    }

    private async sendBatch(batch: PreparedDispatchMessage[], messageGroupId: string): Promise<BatchPublishResult> {
        const entries = batch.map((message, idx) => toEntry(message, idx, messageGroupId));

        const first = await this.trySend(entries);
        const failedIndices = first.failedIds.flatMap((id) => {
            const index = entryIdToIndex(id);
            if (index === null) {
                report(new Error('webhook_dispatch_invalid_failed_entry_id'), { entryId: id });
                return [];
            }

            return [index];
        });
        const invalidFailedCount = first.failedIds.length - failedIndices.length;
        if (failedIndices.length === 0) {
            return {
                enqueued: batch.length - invalidFailedCount,
                failed: invalidFailedCount,
                failedActivityLogIds: [],
                retriedEntries: 0
            };
        }

        const retryEntries = failedIndices.map((i) => entries[i]).filter((e): e is SendMessageBatchRequestEntry => e !== undefined);
        const second = await this.trySend(retryEntries);

        const enqueued = batch.length - invalidFailedCount - second.failedIds.length;
        return {
            enqueued,
            failed: invalidFailedCount + second.failedIds.length,
            failedActivityLogIds: second.failedIds.flatMap((id) => {
                const index = entryIdToIndex(id);
                if (index === null) {
                    report(new Error('webhook_dispatch_invalid_failed_entry_id'), { entryId: id });
                    return [];
                }

                const activityLogId = batch[index]?.message.activityLogId;
                return activityLogId ? [activityLogId] : [];
            }),
            retriedEntries: failedIndices.length
        };
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

function toEntry(message: PreparedDispatchMessage, index: number, messageGroupId: string): SendMessageBatchRequestEntry {
    return {
        Id: indexToEntryId(index),
        MessageBody: JSON.stringify(message.message),
        MessageGroupId: messageGroupId
    };
}

function indexToEntryId(index: number): string {
    return `m${index}`;
}

function entryIdToIndex(id: string): number | null {
    if (!id.startsWith('m')) {
        return null;
    }

    const index = Number.parseInt(id.slice(1), 10);
    return Number.isNaN(index) ? null : index;
}

function chunk(items: PreparedDispatchMessage[], size: number): PreparedDispatchMessage[][] {
    const chunks: PreparedDispatchMessage[][] = [];
    let currentChunk: PreparedDispatchMessage[] = [];
    let currentChunkBytes = 0;

    for (const item of items) {
        const exceedsBatchSize = currentChunk.length >= size;
        const exceedsBatchBytes = currentChunkBytes + item.byteSize > SQS_BATCH_MAX_BYTES;

        if (currentChunk.length > 0 && (exceedsBatchSize || exceedsBatchBytes)) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentChunkBytes = 0;
        }

        currentChunk.push(item);
        currentChunkBytes += item.byteSize;
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
}
