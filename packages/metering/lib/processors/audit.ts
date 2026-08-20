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
                    ...nonIdentifyingFields(r.event.payload.event)
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
        if (typeof decoded.value.payload?.event !== 'string') {
            metrics.increment(metrics.Types.AUDIT_CONSUMER_REJECTED, 1, { reason: 'invalid_schema' });
            report(new Error('Audit consumer: message is not an audit envelope'), { messageId: msg.MessageId });
            return [];
        }
        const unstorable = unstorableReason(decoded.value.payload.event);
        if (unstorable) {
            metrics.increment(metrics.Types.AUDIT_CONSUMER_REJECTED, 1, { reason: unstorable });
            report(new Error('Audit consumer: event cannot be stored'), { messageId: msg.MessageId, reason: unstorable });
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Why the table's constraints are mirrored here rather than left to the insert: a block is atomic, so one
 * unstorable row rejects the whole batch, and the redelivery that follows is re-batched with newly arrived
 * messages. That changes the message-id set the dedup token is derived from, so the token no longer
 * suppresses an attempt that had already been written — one bad event amplifies into duplicates of its
 * neighbours. These three fields are the table's ORDER BY keys, the only extracts that can fail on an
 * otherwise well-formed envelope. Kept as one function so the DLQ redrive can reuse it.
 */
export function unstorableReason(event: string): 'invalid_json' | 'invalid_id' | 'invalid_account_id' | 'invalid_occurred_at' | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(event);
    } catch {
        return 'invalid_json';
    }
    // `null` parses without throwing, and destructuring it would throw out of the poll loop — taking the
    // batch down, which is the failure this function exists to prevent.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return 'invalid_json';
    }
    const { id, accountId, occurredAt } = parsed as Record<string, unknown>;
    if (typeof id !== 'string' || !UUID.test(id)) {
        return 'invalid_id';
    }
    // Matches `CHECK JSONType(event, 'accountId') = 'Int64' AND account_id >= 0`: an integer, and not
    // negative. Account 0 is seeded and is the one every no-auth request runs as, so it has to pass.
    if (typeof accountId !== 'number' || !Number.isSafeInteger(accountId) || accountId < 0) {
        return 'invalid_account_id';
    }
    // `Date.parse` checks that the month is 1-12 and the day 1-31, but not the month's actual length, so
    // 2026-02-30 parses and rolls over to March 2 while ClickHouse rejects it outright. Comparing the day
    // back catches the rollover without demanding a canonical format ClickHouse would have accepted anyway.
    if (typeof occurredAt !== 'string') {
        return 'invalid_occurred_at';
    }
    const occurred = new Date(occurredAt);
    if (Number.isNaN(occurred.getTime()) || occurred.toISOString().slice(0, 10) !== occurredAt.slice(0, 10)) {
        return 'invalid_occurred_at';
    }
    return null;
}

function nonIdentifyingFields(event: string): { eventId?: string | undefined; resource?: string | undefined; action?: string | undefined } {
    try {
        const parsed = JSON.parse(event) as Record<string, unknown>;
        const pick = (key: string): string | undefined => (typeof parsed[key] === 'string' ? (parsed[key] as string) : undefined);
        return { eventId: pick('id'), resource: pick('resource'), action: pick('action') };
    } catch {
        return {};
    }
}

// Derived from the message ids, not random, so a redelivery of the same batch carries the token of the
// attempt that may already have been written and ClickHouse discards it. Sorted because SQS makes no
// ordering promise.
function batchDedupToken(received: Received[]): string {
    const ids: string[] = [];
    for (const { messageId } of received) {
        if (!messageId) {
            return randomUUID();
        }
        ids.push(messageId);
    }
    return createHash('sha256').update(ids.sort().join(',')).digest('hex');
}
