import { createHash, randomUUID } from 'node:crypto';

import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import * as z from 'zod';

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
            metrics.increment(metrics.Types.AUDIT_CONSUMER_REJECTED, 1, { reason: 'subject_mismatch', kind: 'envelope' });
            report(new Error('Audit consumer: message subject mismatch'), { messageId: msg.MessageId });
            return [];
        }
        const decoded = serde.deserialize<AuditRecordedEvent>(Buffer.from(unwrapSqsBody(msg.Body), 'base64'));
        if (decoded.isErr()) {
            metrics.increment(metrics.Types.AUDIT_CONSUMER_REJECTED, 1, { reason: 'invalid_schema', kind: 'envelope' });
            report(new Error('Audit consumer: failed to deserialize message'), { messageId: msg.MessageId });
            return [];
        }
        if (typeof decoded.value.payload?.event !== 'string') {
            metrics.increment(metrics.Types.AUDIT_CONSUMER_REJECTED, 1, { reason: 'invalid_schema', kind: 'envelope' });
            report(new Error('Audit consumer: message is not an audit envelope'), { messageId: msg.MessageId });
            return [];
        }
        // `kind: event` is the alertable half: a real audit event that will never be stored, so a customer's
        // trail has a hole. `kind: envelope` is a message that was never ours to store. Grouping by kind
        // rather than by an enumeration of reasons keeps a monitor correct when a reason is added.
        const unstorable = unstorableReason(decoded.value.payload.event);
        if (unstorable) {
            metrics.increment(metrics.Types.AUDIT_CONSUMER_REJECTED, 1, { reason: unstorable, kind: 'event' });
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

/**
 * The table refuses a row whose ORDER BY keys it cannot read, and a block insert is atomic, so one such row
 * rejects the whole batch. The redelivery that follows is re-batched with newly arrived messages, which
 * changes the message-id set the dedup token is derived from, so the token no longer suppresses an attempt
 * that had already been written — one bad event amplifies into duplicates of its neighbours. These three
 * fields are the keys, mirrored: `>= 0` and an integer for the `account_id` CHECK, a UUID for `toUUID`, and a
 * real calendar date for `parseDateTime64BestEffort`. Kept as one function so the DLQ redrive can reuse it.
 */
const storableEvent = z.object({
    id: z.uuid(),
    accountId: z.number().int().nonnegative(),
    // With the offset allowed: ClickHouse accepts one, and rejecting a storable event is the worse failure.
    occurredAt: z.iso.datetime({ offset: true })
});

type UnstorableReason = 'invalid_json' | 'invalid_id' | 'invalid_account_id' | 'invalid_occurred_at';

// The reason is a metric tag, so it names the field rather than quoting zod's message.
const REASON_BY_FIELD: Record<string, UnstorableReason> = {
    id: 'invalid_id',
    accountId: 'invalid_account_id',
    occurredAt: 'invalid_occurred_at'
};

export function unstorableReason(event: string): UnstorableReason | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(event);
    } catch {
        return 'invalid_json';
    }
    const result = storableEvent.safeParse(parsed);
    if (result.success) {
        return null;
    }
    // A blob that is not an object at all fails with an empty path — `null` parses without throwing.
    const field = result.error.issues[0]?.path[0];
    return (typeof field === 'string' ? REASON_BY_FIELD[field] : undefined) ?? 'invalid_json';
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
