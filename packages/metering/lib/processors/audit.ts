import { createHash, randomUUID } from 'node:crypto';

import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

import { getSubjectMessageAttribute, serde, unwrapSqsBody } from '@nangohq/pubsub';
import { metrics, report } from '@nangohq/utils';

import { envs } from '../env.js';
import { logger } from '../utils.js';

import type { Message } from '@aws-sdk/client-sqs';
import type { AuditBatchWriter } from '@nangohq/audit';
import type { AuditRecordedEvent } from '@nangohq/types';

const SUBJECT = 'audit';

interface Received {
    receiptHandle: string;
    event: AuditRecordedEvent;
    messageId: string | undefined;
    receiveCount: number | undefined;
}

export interface AuditProcessorProps {
    queueUrl: string;
    store: AuditBatchWriter;
    concurrency: number;
    maxMessages: number;
    waitTimeSeconds: number;
    visibilityTimeoutSeconds: number;
    sqs?: SQSClient;
}

/**
 * Polls SQS itself rather than through `@nangohq/pubsub`'s Subscriber, so a whole batch collapses into one
 * insert and this consumer decides when messages are acknowledged.
 */
export class AuditProcessor {
    private readonly sqs: SQSClient;
    private readonly abortController = new AbortController();
    private loops: Promise<void>[] = [];

    constructor(private readonly props: AuditProcessorProps) {
        this.sqs = props.sqs ?? new SQSClient(envs.AWS_REGION ? { region: envs.AWS_REGION } : {});
    }

    public start(): void {
        if (this.loops.length > 0) {
            return;
        }
        logger.info(`Starting audit consumer on ${this.props.queueUrl}`, { concurrency: this.props.concurrency });
        this.loops = Array.from({ length: this.props.concurrency }, () => this.pollLoop());
    }

    public async stop(): Promise<void> {
        this.abortController.abort();
        await Promise.allSettled(this.loops);
        this.loops = [];
        this.sqs.destroy();
    }

    private async pollLoop(): Promise<void> {
        const signal = this.abortController.signal;
        while (!signal.aborted) {
            try {
                const res = await this.sqs.send(
                    new ReceiveMessageCommand({
                        QueueUrl: this.props.queueUrl,
                        MaxNumberOfMessages: this.props.maxMessages,
                        WaitTimeSeconds: this.props.waitTimeSeconds,
                        VisibilityTimeout: this.props.visibilityTimeoutSeconds,
                        MessageAttributeNames: ['All'],
                        MessageSystemAttributeNames: ['ApproximateReceiveCount']
                    }),
                    { abortSignal: signal }
                );
                const messages = res.Messages ?? [];
                if (messages.length > 0) {
                    await this.processBatch(messages, signal);
                }
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') {
                    break;
                }
                report(new Error('Audit consumer receive failed', { cause: err }));
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
    }

    private async processBatch(messages: Message[], signal: AbortSignal): Promise<void> {
        const received = messages.flatMap((msg) => this.decode(msg));
        if (received.length === 0) {
            return;
        }
        metrics.histogram(metrics.Types.AUDIT_CONSUMER_BATCH_SIZE, received.length);

        const result = await this.props.store.recordMany(
            received.map((r) => r.event.payload),
            { dedupToken: batchDedupToken(received) }
        );

        if (result.isErr()) {
            // Left undeleted on purpose: the messages redeliver and, past the queue's maxReceiveCount, reach
            // the DLQ, where they can be redriven once the cause is fixed.
            logger.error(`Failed to store audit events: ${result.error.message}`, {
                messages: received.map((r) => ({
                    messageId: r.messageId,
                    receiveCount: r.receiveCount,
                    ...describe(r.event.payload.event)
                }))
            });
            return;
        }

        await Promise.all(received.map(({ receiptHandle }) => this.deleteMessage(receiptHandle, signal)));
    }

    // Anything it drops is left undeleted, so it reaches the DLQ with its payload intact instead of being
    // discarded here.
    private decode(msg: Message): Received[] {
        if (!msg.Body || !msg.ReceiptHandle) {
            return [];
        }
        if (getSubjectMessageAttribute(msg.Body, msg.MessageAttributes) !== SUBJECT) {
            metrics.increment(metrics.Types.AUDIT_CONSUMER_REJECTED, 1, { reason: 'subject_mismatch' });
            report(new Error('Audit consumer: message subject mismatch'), { messageId: msg.MessageId });
            return [];
        }
        const decoded = serde.deserialize<AuditRecordedEvent>(Buffer.from(unwrapSqsBody(msg.Body), 'base64'));
        if (decoded.isErr()) {
            metrics.increment(metrics.Types.AUDIT_CONSUMER_REJECTED, 1, { reason: 'invalid_schema' });
            report(new Error('Audit consumer: failed to deserialize message'), { messageId: msg.MessageId });
            return [];
        }
        // `deserialize` gives back whatever was serialised, so the type is an assertion rather than a check.
        // Only the envelope this code owns is verified — whether the event itself is storable is the table's
        // constraints to decide, and duplicating them here would give them a second place to drift from.
        if (typeof decoded.value.payload?.event !== 'string') {
            metrics.increment(metrics.Types.AUDIT_CONSUMER_REJECTED, 1, { reason: 'invalid_schema' });
            report(new Error('Audit consumer: message is not an audit envelope'), { messageId: msg.MessageId });
            return [];
        }
        const receiveCount = Number(msg.Attributes?.['ApproximateReceiveCount']);
        return [
            {
                receiptHandle: msg.ReceiptHandle,
                event: decoded.value,
                messageId: msg.MessageId,
                receiveCount: Number.isFinite(receiveCount) ? receiveCount : undefined
            }
        ];
    }

    private async deleteMessage(receiptHandle: string, signal: AbortSignal): Promise<void> {
        try {
            await this.sqs.send(new DeleteMessageCommand({ QueueUrl: this.props.queueUrl, ReceiptHandle: receiptHandle }), { abortSignal: signal });
        } catch (err) {
            report(new Error('Audit consumer delete failed', { cause: err }));
        }
    }
}

// The blob carries the actor's email and IP, so only these non-identifying fields are ever read out of it
// to identify which event in a failed batch was the problem.
function describe(event: string): { eventId?: string | undefined; resource?: string | undefined; action?: string | undefined } {
    try {
        const parsed = JSON.parse(event) as Record<string, unknown>;
        const pick = (key: string): string | undefined => (typeof parsed[key] === 'string' ? (parsed[key] as string) : undefined);
        return { eventId: pick('id'), resource: pick('resource'), action: pick('action') };
    } catch {
        return {};
    }
}

// Derived from the message ids rather than random, so a batch redelivered whole — the common case, since a
// failed insert makes all of its messages visible again together — carries the token of the attempt that
// may already have been written, and ClickHouse discards it. SQS is free to regroup messages across
// deliveries, in which case the token differs and the copy is caught by ReplacingMergeTree and the read
// instead. Falls back to a random token if any id is missing, which only loses that dedup.
function batchDedupToken(received: Received[]): string {
    const ids: string[] = [];
    for (const { messageId } of received) {
        if (!messageId) {
            return randomUUID();
        }
        ids.push(messageId);
    }
    // Codepoint order, not localeCompare: the token has to hash identically on every pod.
    ids.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return createHash('sha256').update(ids.join(',')).digest('hex');
}
