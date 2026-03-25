import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

import { Err, Ok, getLogger, report } from '@nangohq/utils';

import { serde } from '../utils/serde.js';

import type { SubscribeProps, Transport } from './transport.js';
import type { Event } from '../event.js';
import type { Result } from '@nangohq/utils';

const logger = getLogger('pubsub.sns-sqs');

function subscriptionKey(consumerGroup: string, subject: string): string {
    return `${consumerGroup}:${subject}`;
}

/** SNS→SQS subscriptions wrap the published payload in a JSON envelope unless raw delivery is enabled. */
function unwrapSqsBody(body: string): string {
    try {
        const parsed = JSON.parse(body) as { Type?: string; Message?: string };
        if (parsed?.Type === 'Notification' && typeof parsed.Message === 'string') {
            return parsed.Message;
        }
    } catch {
        // treat as raw payload (e.g. tests or raw delivery)
    }
    return body;
}

export interface SnsSqsProps {
    /** Maps event subject (`user`, `team`, `usage`) to SNS topic ARN. Every published subject must have an entry. */
    topicArns?: Record<string, string>;
    /** Maps `consumerGroup:subject` to SQS queue URL. */
    queueUrls?: Record<string, string>;
    snsClient?: SNSClient;
    sqsClient?: SQSClient;
}

/**
 * Pub/sub transport backed by SNS (fan-out per event subject) and SQS (one queue per consumer group + subject).
 * Mirrors ActiveMQ virtual-topic semantics: publish to a topic per `event.subject`; each consumer uses a dedicated queue
 * subscribed to that topic. Pass config in the constructor (e.g. from `NANGO_PUBSUB_SNS_SQS_CONFIG` via `DefaultTransport`).
 */
export class SnsSqs implements Transport {
    private readonly sns: SNSClient;
    private readonly sqs: SQSClient;
    private readonly queueUrls: Record<string, string>;
    private readonly topicArns: Record<string, string>;
    private isConnected = false;
    private readonly activeSubscriptions = new Map<string, SubscribeProps<any>>();
    private readonly pollerAbort = new Map<string, AbortController>();

    constructor(props?: SnsSqsProps) {
        this.sns = props?.snsClient ?? new SNSClient({});
        this.sqs = props?.sqsClient ?? new SQSClient({});
        this.queueUrls = props?.queueUrls ?? {};
        this.topicArns = { ...(props?.topicArns ?? {}) };
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async connect(_props?: { timeoutMs: number }): Promise<Result<void>> {
        if (this.isConnected) {
            return Ok(undefined);
        }
        this.isConnected = true;
        const copy = new Map(this.activeSubscriptions);
        for (const [key, props] of copy) {
            this.startPoller(key, props);
        }
        logger.info('SNS+SQS transport connected');
        return Ok(undefined);
    }

    public unsubscribeAll(): void {
        for (const ac of this.pollerAbort.values()) {
            ac.abort();
        }
        this.pollerAbort.clear();
        this.activeSubscriptions.clear();
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async disconnect(): Promise<Result<void>> {
        this.isConnected = false;
        for (const ac of this.pollerAbort.values()) {
            ac.abort();
        }
        this.pollerAbort.clear();
        logger.info('SNS+SQS transport disconnected');
        return Ok(undefined);
    }

    public async publish(event: Event): Promise<Result<void>> {
        if (!this.isConnected) {
            logger.error('SNS+SQS publisher not connected');
            return Err('SNS+SQS publisher not connected');
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
        this.activeSubscriptions.set(key, props);
        this.startPoller(key, props);
    }

    private startPoller<TSubject extends Event['subject']>(key: string, props: SubscribeProps<TSubject>): void {
        if (!this.isConnected) {
            return;
        }
        const queueUrl = this.queueUrls[key];
        if (!queueUrl) {
            return;
        }
        const abort = new AbortController();
        this.pollerAbort.set(key, abort);
        void this.pollQueue(queueUrl, props, abort.signal);
    }

    private async pollQueue<TSubject extends Event['subject']>(queueUrl: string, props: SubscribeProps<TSubject>, signal: AbortSignal): Promise<void> {
        const { subject, callback } = props;
        while (!signal.aborted) {
            try {
                const result = await this.sqs.send(
                    new ReceiveMessageCommand({
                        QueueUrl: queueUrl,
                        MaxNumberOfMessages: 10,
                        WaitTimeSeconds: 20,
                        VisibilityTimeout: 60
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
                    const rawPayload = unwrapSqsBody(msg.Body);
                    let buf: Buffer;
                    try {
                        buf = Buffer.from(rawPayload, 'base64');
                    } catch (err) {
                        report(new Error('SNS+SQS: invalid base64 message body'), { subject, error: err });
                        continue;
                    }
                    const decoded = serde.deserialize<Extract<Event, { subject: TSubject }>>(buf);
                    if (decoded.isErr()) {
                        report(new Error('SNS+SQS: failed to deserialize message'), { subject, error: decoded.error });
                    } else {
                        try {
                            await Promise.resolve(callback(decoded.value));
                        } catch (err) {
                            report(new Error('SNS+SQS: subscriber callback error'), { subject, error: err });
                        }
                    }
                    try {
                        await this.sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: msg.ReceiptHandle }), { abortSignal: signal });
                    } catch (err) {
                        report(new Error('SNS+SQS: delete message error'), { subject, error: err });
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
}
