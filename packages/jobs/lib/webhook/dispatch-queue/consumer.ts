import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import * as z from 'zod';

import { getLogger, metrics, report } from '@nangohq/utils';

import type { Message } from '@aws-sdk/client-sqs';
import type { OrchestratorClient } from '@nangohq/nango-orchestrator';
import type { WebhookDispatchMessage } from '@nangohq/types';

const logger = getLogger('jobs.webhook.dispatch-queue.consumer');

const getRegion = (): string => {
    const env = typeof process !== 'undefined' ? process.env['LAMBDA_REGION'] : undefined;
    return env ?? 'us-west-2';
};

const messageSchema: z.ZodType<WebhookDispatchMessage> = z.object({
    version: z.literal(1),
    kind: z.literal('webhook'),
    taskName: z.string().min(1),
    createdAt: z.string().min(1),
    ingressRequestId: z.string().min(1),
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
    private readonly maxMessages: number;
    private readonly waitTimeSeconds: number;
    private readonly visibilityTimeoutSeconds: number;
    private readonly abortController = new AbortController();
    private loopPromise: Promise<void> | undefined;

    constructor(props: DispatchQueueConsumerProps) {
        this.queueUrl = props.queueUrl;
        this.orchestratorClient = props.orchestratorClient;
        this.webhookMaxConcurrency = props.webhookMaxConcurrency;
        this.maxMessages = props.maxMessages;
        this.waitTimeSeconds = props.waitTimeSeconds;
        this.visibilityTimeoutSeconds = props.visibilityTimeoutSeconds;
        this.sqs = props.sqs ?? new SQSClient({ region: getRegion() });
    }

    start(): void {
        if (this.loopPromise) {
            return;
        }
        logger.info(`webhook dispatch consumer subscribing to ${this.queueUrl}`);
        this.loopPromise = this.pollLoop();
    }

    async stop(): Promise<void> {
        this.abortController.abort();
        if (this.loopPromise) {
            await this.loopPromise;
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
        if (!msg.Body || !msg.ReceiptHandle) return;

        const parsed = this.parseMessage(msg.Body);
        if (!parsed) {
            metrics.increment(metrics.Types.WEBHOOK_DISPATCH_POISON_PILL);
            // Parse failures are poison pills — redelivering won't help. Delete and move on.
            await this.tryDeleteMessage(msg.ReceiptHandle);
            return;
        }
        const message = parsed;

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
            metrics.increment(metrics.Types.WEBHOOK_DISPATCH_SCHEDULE_FAILURE, 1, { provider: message.provider });
            metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME_FAILURE, 1, { provider: message.provider });
            logger.error(`failed to schedule webhook task ${message.taskName}`, { error: scheduleRes.error });
            // Don't delete — let SQS redeliver and eventually DLQ.
            return;
        }

        metrics.increment(metrics.Types.WEBHOOK_DISPATCH_SCHEDULE_SUCCESS, 1, { provider: message.provider });
        metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME_SUCCESS, 1, { provider: message.provider });

        await this.tryDeleteMessage(msg.ReceiptHandle);
    }

    private parseMessage(body: string): WebhookDispatchMessage | null {
        try {
            const json = JSON.parse(body);
            const result = messageSchema.safeParse(json);
            if (!result.success) {
                logger.error('webhook dispatch consumer received invalid message', { issues: result.error.issues });
                return null;
            }
            return result.data;
        } catch (err) {
            logger.error('webhook dispatch consumer could not JSON.parse body', { error: err });
            return null;
        }
    }

    private async tryDeleteMessage(receiptHandle: string): Promise<void> {
        try {
            await this.sqs.send(new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: receiptHandle }), {
                abortSignal: this.abortController.signal
            });
        } catch (err) {
            report(new Error('webhook dispatch consumer delete failed', { cause: err }));
        }
    }
}
