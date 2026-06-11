import { PublishBatchCommand, PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import * as z from 'zod';

import { Err, Ok, chunk, getLogger, matchWith, report, runWithConcurrencyLimit } from '@nangohq/utils';

import { envs } from '../env.js';
import { PublishFailure } from './transport.js';
import { serde } from '../utils/serde.js';

import type { PublishBatchProps, PublishBatchResult, SubscribeProps, Transport } from './transport.js';
import type { BatchResultErrorEntry, PublishBatchRequestEntry } from '@aws-sdk/client-sns';
import type { Event } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export const SNS_BATCH_MAX_SIZE = 10;
export const SNS_BATCH_MAX_BYTES = 262_144;

const logger = getLogger('pubsub.sns-sqs');

const snsNotificationEnvelopeSchema = z.object({
    Type: z.literal('Notification'),
    Message: z.string()
});

const snsEnvelopeSubjectSchema = z.looseObject({
    MessageAttributes: z.record(z.string(), z.object({ Value: z.string().optional() })).optional()
});

const sqsMessageAttributesSchema = z.record(z.string(), z.looseObject({ StringValue: z.string().optional() }));

function subscriptionKey<TSubject extends Event['subject']>(consumerGroup: string, subject: TSubject): `${string}:${TSubject}` {
    return `${consumerGroup}:${subject}`;
}

function publishConcurrency(concurrency: number | undefined): number {
    const n = concurrency ?? 10;
    if (!Number.isFinite(n)) {
        return 10;
    }
    return Math.max(1, Math.min(10, Math.floor(n)));
}

function toSnsEntry(event: Event): Result<PublishBatchRequestEntry, PublishFailure> {
    return serde
        .serialize(event)
        .map((encoded: Buffer) => ({
            Id: event.idempotencyKey,
            Message: encoded.toString('base64'),
            MessageAttributes: {
                subject: { DataType: 'String', StringValue: event.subject }
            }
        }))
        .mapError((e: unknown) => new PublishFailure(event.idempotencyKey, 'Failed to serialize event', { cause: e }));
}

function asPublishFailure(idempotencyKey: string, error: BatchResultErrorEntry): PublishFailure {
    const errorCode = error.Code !== undefined ? { code: error.Code } : undefined;
    return new PublishFailure(idempotencyKey, error.Message ?? 'SNS rejected message', errorCode);
}

function subscribeConcurrency(concurrency: number | undefined): number {
    const n = concurrency ?? 1;
    if (!Number.isFinite(n)) {
        return 1;
    }
    return Math.max(1, Math.min(10, Math.floor(n)));
}

function unwrapSqsBody(body: string): string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        return body;
    }
    const envelope = snsNotificationEnvelopeSchema.safeParse(parsed);
    if (envelope.success) {
        return envelope.data.Message;
    }
    return body;
}

function getSubjectMessageAttribute(body: string, messageAttributes?: unknown): string | undefined {
    const attrs = sqsMessageAttributesSchema.safeParse(messageAttributes);
    if (attrs.success) {
        const fromSqsAttr = attrs.data['subject']?.StringValue;
        if (typeof fromSqsAttr === 'string' && fromSqsAttr.length > 0) {
            return fromSqsAttr;
        }
    }

    let parsedJson: unknown;
    try {
        parsedJson = JSON.parse(body);
    } catch {
        return undefined;
    }
    const envelope = snsEnvelopeSubjectSchema.safeParse(parsedJson);
    if (envelope.success) {
        const fromEnvelope = envelope.data.MessageAttributes?.['subject']?.Value;
        if (typeof fromEnvelope === 'string' && fromEnvelope.length > 0) {
            return fromEnvelope;
        }
    }

    return undefined;
}

export interface SnsSqsProps {
    topicArns?: Partial<Record<Event['subject'], string>>;
    queueUrls?: Partial<Record<`${string}:${Event['subject']}`, string>>;
    snsClient?: SNSClient;
    sqsClient?: SQSClient;
}

export class SnsSqs implements Transport {
    private readonly sns: SNSClient;
    private readonly sqs: SQSClient;
    private readonly queueUrls: Partial<Record<`${string}:${Event['subject']}`, string>>;
    private readonly topicArns: Partial<Record<Event['subject'], string>>;
    private isConnected = false;
    private readonly pollerAbort = new Map<string, AbortController>();

    constructor(props?: SnsSqsProps) {
        this.sns = props?.snsClient ?? new SNSClient({});
        this.sqs = props?.sqsClient ?? new SQSClient({});
        this.queueUrls = props?.queueUrls ?? {};
        this.topicArns = { ...(props?.topicArns ?? {}) };
    }

    public async connect(_props?: { timeoutMs: number }): Promise<Result<void>> {
        this.isConnected = true;
        logger.info('SNS+SQS transport connected');
        return Promise.resolve(Ok(undefined));
    }

    public async disconnect(): Promise<Result<void>> {
        this.isConnected = false;
        for (const ac of this.pollerAbort.values()) {
            ac.abort();
        }
        this.pollerAbort.clear();
        this.sns.destroy();
        this.sqs.destroy();
        logger.info('SNS+SQS transport disconnected');
        return Promise.resolve(Ok(undefined));
    }

    public async publish(event: Event): Promise<Result<void>> {
        if (!this.isConnected) {
            logger.error('SNS+SQS publisher not connected');
            return Err(new Error('SNS+SQS publisher not connected'));
        }
        const topicArn = this.topicArns[event.subject];
        if (!topicArn) {
            logger.error(`No SNS topic ARN configured for subject ${event.subject}`, { topicArn });
            return Err(new Error(`No SNS topic ARN configured for subject "${event.subject}"`));
        }
        try {
            const encoded = serde.serialize(event);
            if (encoded.isErr()) {
                return Err(new Error(`Failed to encode event: ${encoded.error}`));
            }
            const message = encoded.value.toString('base64');
            await this.sns.send(
                new PublishCommand({
                    TopicArn: topicArn,
                    Message: message,
                    MessageAttributes: {
                        subject: { DataType: 'String', StringValue: event.subject }
                    }
                })
            );
            return Ok(undefined);
        } catch (err) {
            logger.error(`Failed to publish message to SNS for subject ${event.subject}`, { error: err });
            return Err(new Error(`Failed to publish message to SNS for subject ${event.subject}`, { cause: err }));
        }
    }

    public async publishBatch<S extends Event['subject']>({ subject, events, concurrency }: PublishBatchProps<S>): Promise<Result<PublishBatchResult>> {
        if (!this.isConnected) {
            return Err(new Error('SNS+SQS publisher not connected'));
        }

        // runtime sanity check for homogeneous subject
        if (events.find((e) => e.subject !== subject)) {
            return Err(new Error(`All events must be of the provided subject: "${subject}"`));
        }

        const topicArn = this.topicArns[subject];
        if (!topicArn) {
            return Err(new Error(`No SNS topic ARN configured for subject "${subject}"`));
        }

        const failed: PublishFailure[] = [];
        const entries: PublishBatchRequestEntry[] = [];

        try {
            events.map(toSnsEntry).forEach(
                matchWith(
                    (entry) => entries.push(entry),
                    (err) => failed.push(err)
                )
            );

            const batches = chunk(
                entries,
                () => ({ count: 0, bytes: 0 }),
                (acc, item) => ({ count: acc.count + 1, bytes: acc.bytes + Buffer.byteLength(item.Message ?? '', 'utf8') }),
                (acc, item) => acc.count >= SNS_BATCH_MAX_SIZE || acc.bytes + Buffer.byteLength(item.Message ?? '', 'utf8') > SNS_BATCH_MAX_BYTES
            );

            const successful: string[] = [];

            await runWithConcurrencyLimit(batches, publishConcurrency(concurrency), async (batch, _) => {
                // Map each batch entry's index to its original idempotencyKey to support a reverse-lookup from SNS responses
                const idMap = new Map(batch.map((entry, i) => [String(i), entry.Id!]));
                const batchWithPositionalIds = batch.map((entry, i) => ({ ...entry, Id: String(i) }));

                const cmd = new PublishBatchCommand({
                    TopicArn: topicArn,
                    PublishBatchRequestEntries: batchWithPositionalIds
                });

                await this.sns
                    .send(cmd)
                    .then((response) => {
                        successful.push(...(response.Successful ?? []).map((s) => idMap.get(s.Id!) ?? s.Id!));
                        failed.push(...(response.Failed ?? []).map((e) => asPublishFailure(idMap.get(e.Id!) ?? e.Id!, e)));
                    })
                    .catch((err: unknown) => {
                        failed.push(...batch.map((f) => new PublishFailure(f.Id!, 'Batch publish request failed', { cause: err })));
                    });
            });

            return Ok({ successful, failed });
        } catch (err) {
            return Err(new Error(`Failed to publish batch to SNS for subject "${subject}"`, { cause: err }));
        }
    }

    public subscribe<TSubject extends Event['subject']>(props: SubscribeProps<TSubject>): void {
        const { consumerGroup, subject } = props;
        const key = subscriptionKey(consumerGroup, subject);
        if (!this.isConnected) {
            logger.error('SNS+SQS consumer not connected, cannot subscribe to events', { consumerGroup, subject });
            report(new Error('SNS+SQS consumer not connected, cannot subscribe to events'), { consumerGroup, subject });
            return;
        }
        const queueUrl = this.queueUrls[key];
        if (!queueUrl) {
            logger.error(`No SQS queue URL configured for subscription ${key}`, { queueUrl });
            report(new Error('SNS+SQS: no SQS queue URL for subscription'), { consumerGroup, subject, key });
            return;
        }

        const existing = this.pollerAbort.get(key);
        if (existing) {
            existing.abort();
            this.pollerAbort.delete(key);
        }
        this.startPoller(key, props);
    }

    private startPoller<TSubject extends Event['subject']>(key: `${string}:${TSubject}`, props: SubscribeProps<TSubject>): void {
        if (!this.isConnected) {
            return;
        }
        const queueUrl = this.queueUrls[key];
        if (!queueUrl) {
            return;
        }
        const abort = new AbortController();
        this.pollerAbort.set(key, abort);
        const loops = subscribeConcurrency(props.concurrency);
        for (let i = 0; i < loops; i++) {
            void this.pollQueue(queueUrl, props, abort.signal);
        }
    }

    private async pollQueue<TSubject extends Event['subject']>(queueUrl: string, props: SubscribeProps<TSubject>, signal: AbortSignal): Promise<void> {
        const { subject, callback } = props;
        while (!signal.aborted) {
            try {
                const result = await this.sqs.send(
                    new ReceiveMessageCommand({
                        QueueUrl: queueUrl,
                        MaxNumberOfMessages: envs.NANGO_PUBSUB_SNS_SQS_MAX_MESSAGES,
                        WaitTimeSeconds: envs.NANGO_PUBSUB_SNS_SQS_WAIT_TIME_SECONDS,
                        VisibilityTimeout: envs.NANGO_PUBSUB_SNS_SQS_VISIBILITY_TIMEOUT_SECONDS,
                        MessageAttributeNames: ['All']
                    }),
                    { abortSignal: signal }
                );
                const messages = result.Messages ?? [];
                for (const msg of messages) {
                    if (signal.aborted) {
                        break;
                    }
                    if (!msg.Body || !msg.ReceiptHandle) {
                        continue;
                    }
                    const action = await this.processMessage(msg.Body, msg.MessageAttributes, subject, callback);
                    if (action === 'delete') {
                        try {
                            await this.sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: msg.ReceiptHandle }), { abortSignal: signal });
                        } catch (err) {
                            report(new Error('SNS+SQS: delete message error'), { subject, error: err });
                        }
                    }
                }
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') {
                    break;
                }
                report(new Error('SNS+SQS: receive message error'), { subject, error: err });
                await new Promise((r) => setTimeout(r, 1000));
            }
        }
    }

    private async processMessage<TSubject extends Event['subject']>(
        body: string,
        messageAttributes: unknown,
        expectedSubject: TSubject,
        callback: SubscribeProps<TSubject>['callback']
    ): Promise<'delete' | 'retry'> {
        const messageSubject = getSubjectMessageAttribute(body, messageAttributes);
        if (messageSubject !== expectedSubject) {
            report(new Error('SNS+SQS: message subject does not match subscriber subject'), {
                expectedSubject,
                messageSubject
            });
            return 'retry';
        }

        const rawPayload = unwrapSqsBody(body);
        const buf = Buffer.from(rawPayload, 'base64');
        const decoded = serde.deserialize<Extract<Event, { subject: TSubject }>>(buf);
        if (decoded.isErr()) {
            report(new Error('SNS+SQS: failed to deserialize message'), { subject: expectedSubject, error: decoded.error });
            return 'retry';
        }
        try {
            await Promise.resolve(callback(decoded.value));
            return 'delete';
        } catch (err) {
            report(new Error('SNS+SQS: subscriber callback error'), { subject: expectedSubject, error: err });
            return 'retry';
        }
    }
}
