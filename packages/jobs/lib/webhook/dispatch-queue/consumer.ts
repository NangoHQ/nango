import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import tracer from 'dd-trace';
import * as z from 'zod';

import { getLogger, metrics, report } from '@nangohq/utils';

import type { Message } from '@aws-sdk/client-sqs';
import type { OrchestratorClient } from '@nangohq/nango-orchestrator';
import type { WebhookDispatchMessage } from '@nangohq/types';

const logger = getLogger('jobs.webhook.dispatch-queue.consumer');

type ParseMessageResult = { success: true; message: WebhookDispatchMessage } | { success: false; reason: 'invalid_schema' | 'json_parse' };

const getRegion = (): string => {
    const env = typeof process !== 'undefined' ? process.env['LAMBDA_REGION'] : undefined;
    return env ?? 'us-west-2';
};

const messageSchema: z.ZodType<WebhookDispatchMessage> = z.object({
    version: z.literal(1),
    kind: z.literal('webhook'),
    taskName: z.string().min(1),
    createdAt: z.string().min(1),
    accountId: z.number(),
    environmentId: z.number(),
    integrationId: z.number(),
    provider: z.string(),
    providerConfigKey: z.string(),
    parentSyncName: z.string(),
    activityLogId: z.string(),
    webhookName: z.string(),
    connection: z.object({
        id: z.number(),
        connection_id: z.string(),
        provider_config_key: z.string(),
        environment_id: z.number()
    }),
    payload: z.unknown()
});

export interface DispatchQueueConsumerProps {
    queueUrl: string;
    orchestratorClient: OrchestratorClient;
    webhookMaxConcurrency: number;
    consumerConcurrency: number;
    maxMessages: number;
    waitTimeSeconds: number;
    visibilityTimeoutSeconds: number;
    sqs?: SQSClient;
}

export class DispatchQueueConsumer {
    private readonly sqs: SQSClient;
    private readonly queueUrl: string;
    private readonly orchestratorClient: OrchestratorClient;
    private readonly webhookMaxConcurrency: number;
    private readonly consumerConcurrency: number;
    private readonly maxMessages: number;
    private readonly waitTimeSeconds: number;
    private readonly visibilityTimeoutSeconds: number;
    private readonly abortController = new AbortController();
    private loopPromises: Promise<void>[] = [];

    constructor(props: DispatchQueueConsumerProps) {
        this.queueUrl = props.queueUrl;
        this.orchestratorClient = props.orchestratorClient;
        this.webhookMaxConcurrency = props.webhookMaxConcurrency;
        this.consumerConcurrency = props.consumerConcurrency;
        this.maxMessages = props.maxMessages;
        this.waitTimeSeconds = props.waitTimeSeconds;
        this.visibilityTimeoutSeconds = props.visibilityTimeoutSeconds;
        this.sqs = props.sqs ?? new SQSClient({ region: getRegion() });
    }

    start(): void {
        if (this.loopPromises.length > 0) {
            return;
        }
        logger.info(`webhook dispatch consumer subscribing to ${this.queueUrl}`, { consumerConcurrency: this.consumerConcurrency });
        this.loopPromises = Array.from({ length: this.consumerConcurrency }, () => this.pollLoop());
    }

    async stop(): Promise<void> {
        this.abortController.abort();
        if (this.loopPromises.length > 0) {
            await Promise.allSettled(this.loopPromises);
            this.loopPromises = [];
        }
        this.sqs.destroy();
    }

    private async pollLoop(): Promise<void> {
        const signal = this.abortController.signal;
        while (!signal.aborted) {
            try {
                const result = await this.sqs.send(
                    new ReceiveMessageCommand({
                        QueueUrl: this.queueUrl,
                        MaxNumberOfMessages: this.maxMessages,
                        WaitTimeSeconds: this.waitTimeSeconds,
                        VisibilityTimeout: this.visibilityTimeoutSeconds,
                        MessageAttributeNames: ['All'],
                        MessageSystemAttributeNames: ['SentTimestamp', 'ApproximateReceiveCount']
                    }),
                    { abortSignal: signal }
                );

                const messages = result.Messages ?? [];
                if (messages.length === 0) continue;

                // Process all messages in a batch concurrently. Each SQS receive is already
                // capped at maxMessages (<=10) so no extra semaphore is needed.
                await Promise.all(messages.map((msg) => this.processMessage(msg)));
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') break;
                report(new Error('webhook dispatch consumer receive failed', { cause: err }));
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
    }

    private async processMessage(msg: Message): Promise<void> {
        const active = tracer.scope().active();
        const span = tracer.startSpan('jobs.webhook.dispatch_queue.process', {
            ...(active ? { childOf: active } : {})
        });

        return await tracer.scope().activate(span, async () => {
            try {
                if (!msg.Body || !msg.ReceiptHandle) {
                    return;
                }

                const parsed = this.parseMessage(msg.Body);
                if (!parsed.success) {
                    span.setTag('poison_pill', true);
                    span.setTag('poison_pill_reason', parsed.reason);
                    metrics.increment(metrics.Types.WEBHOOK_DISPATCH_POISON_PILL);
                    // Parse failures are poison pills — redelivering won't help. Delete and move on.
                    await this.tryDeleteMessage(msg.ReceiptHandle);
                    return;
                }

                const message = parsed.message;
                span.setTag('taskName', message.taskName);
                span.setTag('provider', message.provider);
                span.setTag('environmentId', message.environmentId);

                const sentTimestampMs = Number(msg.Attributes?.['SentTimestamp'] ?? '0');
                if (sentTimestampMs > 0) {
                    metrics.duration(metrics.Types.WEBHOOK_DISPATCH_DWELL_MS, Date.now() - sentTimestampMs, { provider: message.provider });
                }

                const scheduleRes = await this.orchestratorClient.immediate({
                    name: message.taskName,
                    group: { key: `webhook:environment:${message.environmentId}`, maxConcurrency: this.webhookMaxConcurrency },
                    retry: { count: 0, max: 0 },
                    timeoutSettingsInSecs: { createdToStarted: 5 * 60, startedToCompleted: 60 * 60, heartbeat: 5 * 60 },
                    args: {
                        type: 'webhook',
                        webhookName: message.webhookName,
                        parentSyncName: message.parentSyncName,
                        connection: message.connection,
                        activityLogId: message.activityLogId,
                        input: (message.payload ?? null) as never
                    }
                });

                if (scheduleRes.isErr()) {
                    if (isDuplicateTaskNameSchedulingError(scheduleRes.error, message.taskName)) {
                        span.setTag('duplicate_task_name', true);
                        metrics.increment(metrics.Types.WEBHOOK_DISPATCH_SCHEDULE_SUCCESS, 1, { provider: message.provider });
                        metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME_SUCCESS, 1, { provider: message.provider });
                        await this.tryDeleteMessage(msg.ReceiptHandle);
                        return;
                    }

                    metrics.increment(metrics.Types.WEBHOOK_DISPATCH_SCHEDULE_FAILURE, 1, { provider: message.provider });
                    metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME_FAILURE, 1, { provider: message.provider });
                    span.setTag('error', true);
                    span.setTag('error.type', scheduleRes.error.name);
                    span.setTag('error.message', scheduleRes.error.message);

                    const responsePayload = getClientErrorResponsePayload(scheduleRes.error);
                    if (responsePayload) {
                        span.setTag('error.details', responsePayload);
                    }

                    // Don't delete — let SQS redeliver and eventually DLQ.
                    return;
                }

                metrics.increment(metrics.Types.WEBHOOK_DISPATCH_SCHEDULE_SUCCESS, 1, { provider: message.provider });
                metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME_SUCCESS, 1, { provider: message.provider });

                await this.tryDeleteMessage(msg.ReceiptHandle);
            } finally {
                span.finish();
            }
        });
    }

    private parseMessage(body: string): ParseMessageResult {
        try {
            const json = JSON.parse(body);
            const result = messageSchema.safeParse(json);
            if (!result.success) {
                return { success: false, reason: 'invalid_schema' };
            }
            return { success: true, message: result.data };
        } catch (_err) {
            return { success: false, reason: 'json_parse' };
        }
    }

    private async tryDeleteMessage(receiptHandle: string): Promise<void> {
        try {
            await this.sqs.send(new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: receiptHandle }));
        } catch (err) {
            report(new Error('webhook dispatch consumer delete failed', { cause: err }));
        }
    }
}

function isDuplicateTaskNameSchedulingError(err: unknown, taskName: string): boolean {
    if (!err || typeof err !== 'object') {
        return false;
    }

    const error = err as {
        name?: string;
        payload?: {
            response?: {
                error?: {
                    code?: string;
                    payload?: {
                        reason?: string;
                        taskName?: string;
                    };
                };
                reason?: string;
                taskName?: string;
            };
        };
    };

    const directReason = error.payload?.response?.reason;
    const directTaskName = error.payload?.response?.taskName;
    if (error.name === 'immediate_failed' && directReason === 'duplicate_task_name' && directTaskName === taskName) {
        return true;
    }

    return (
        error.name === 'fetch_failed' &&
        error.payload?.response?.error?.code === 'immediate_failed' &&
        error.payload.response.error.payload?.reason === 'duplicate_task_name' &&
        error.payload.response.error.payload?.taskName === taskName
    );
}

function getClientErrorResponsePayload(err: { payload?: unknown }): string | null {
    const payload = err.payload;
    if (!payload || typeof payload !== 'object' || !('response' in payload)) {
        return null;
    }

    const responsePayload = payload.response;
    if (responsePayload === undefined) {
        return null;
    }

    return JSON.stringify(responsePayload);
}
