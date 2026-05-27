import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import tracer from 'dd-trace';
import * as z from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { jsonSchema } from '@nangohq/nango-orchestrator';
import { Err, Ok, getLogger, metrics, report } from '@nangohq/utils';

import { envs } from '../../env.js';

import type { Message } from '@aws-sdk/client-sqs';
import type { ExecuteWebhookProps, OrchestratorClient } from '@nangohq/nango-orchestrator';
import type { WebhookDispatchMessage } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('jobs.webhook.dispatch-queue.consumer');

const messageSchema: z.ZodType<WebhookDispatchMessage> = z.object({
    version: z.literal(1),
    kind: z.literal('webhook'),
    taskName: z.string().min(1),
    createdAt: z.string().min(1),
    accountId: z.number(),
    integrationId: z.number(),
    provider: z.string(),
    parentSyncName: z.string(),
    activityLogId: z.string(),
    webhookName: z.string(),
    connection: z.object({
        id: z.number(),
        connection_id: z.string(),
        provider_config_key: z.string(),
        environment_id: z.number()
    }),
    payload: jsonSchema
});

export interface DispatchQueueConsumerProps {
    queueUrl: string;
    orchestratorClient: OrchestratorClient;
    webhookMaxConcurrency: number;
    consumerConcurrency: number;
    maxMessages: number;
    waitTimeSeconds: number;
    visibilityTimeoutSeconds: number;
    maxAgeMs: number;
    sqs?: SQSClient;
}

interface ParsedEntry {
    msg: Message;
    parsed: WebhookDispatchMessage;
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
    private readonly maxAgeMs: number;
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
        this.maxAgeMs = props.maxAgeMs;
        this.sqs = props.sqs ?? new SQSClient(envs.AWS_REGION ? { region: envs.AWS_REGION } : {});
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

                await this.processBatch(messages);
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') break;
                report(new Error('webhook dispatch consumer receive failed', { cause: err }));
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
    }

    private async processBatch(messages: Message[]): Promise<void> {
        const active = tracer.scope().active();
        const span = tracer.startSpan('jobs.webhook.dispatch_queue.process_batch', {
            ...(active ? { childOf: active } : {}),
            tags: { 'webhook.dispatch.received': messages.length }
        });

        return await tracer.scope().activate(span, async () => {
            try {
                const entries = await this.filterMessages(messages);
                if (entries.length === 0) {
                    return;
                }

                metrics.histogram(metrics.Types.WEBHOOK_DISPATCH_BATCH_SIZE, entries.length);
                span.setTag('batch_size', entries.length);

                const propsList: ExecuteWebhookProps[] = entries.map(({ parsed: m }) => ({
                    name: m.taskName,
                    group: { key: `webhook:environment:${m.connection.environment_id}`, maxConcurrency: this.webhookMaxConcurrency },
                    args: {
                        webhookName: m.webhookName,
                        parentSyncName: m.parentSyncName,
                        connection: m.connection,
                        activityLogId: m.activityLogId,
                        input: m.payload
                    }
                }));

                const res = await this.orchestratorClient.executeWebhookBatch(propsList);
                if (res.isErr()) {
                    span.setTag('error', true);
                    span.setTag('error.type', res.error.name);
                    span.setTag('error.message', res.error.message);
                    const responsePayload = getClientErrorResponsePayload(res.error);
                    if (responsePayload) {
                        span.setTag('error.details', responsePayload);
                    }
                    metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME_FAILURE, entries.length);
                    report(new Error('webhook dispatch consumer batch failed', { cause: res.error }));
                    return;
                }

                await this.handleBatchResult(entries, res.value);
            } finally {
                span.finish();
            }
        });
    }

    private async filterMessages(messages: Message[]): Promise<ParsedEntry[]> {
        const entries: ParsedEntry[] = [];
        for (const msg of messages) {
            if (msg.Body === undefined || !msg.ReceiptHandle) {
                continue;
            }

            const parsed = this.parseMessage(msg.Body);
            if (parsed.isErr()) {
                metrics.increment(metrics.Types.WEBHOOK_DISPATCH_POISON_PILL);
                await this.tryDeleteMessage(msg.ReceiptHandle);
                continue;
            }

            const message = parsed.value;
            const sentTimestampMs = Number(msg.Attributes?.['SentTimestamp'] ?? '0');
            if (sentTimestampMs > 0) {
                const dwellMs = Date.now() - sentTimestampMs;
                metrics.duration(metrics.Types.WEBHOOK_DISPATCH_DWELL_MS, dwellMs, { provider: message.provider });

                if (this.maxAgeMs > 0 && dwellMs > this.maxAgeMs) {
                    metrics.increment(metrics.Types.WEBHOOK_DISPATCH_STALE, 1, { accountId: message.accountId });
                    const logCtx = logContextGetter.get({ id: message.activityLogId, accountId: message.accountId });
                    await logCtx.warn('Webhook was discarded: it spent too long in the queue and was not processed.', { dwell_ms: dwellMs });
                    await this.tryDeleteMessage(msg.ReceiptHandle);
                    continue;
                }
            }

            entries.push({ msg, parsed: message });
        }
        return entries;
    }

    private async handleBatchResult(
        entries: ParsedEntry[],
        results: Awaited<ReturnType<OrchestratorClient['executeWebhookBatch']>> extends Result<infer R> ? R : never
    ): Promise<void> {
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i]!;
            const result = results[i];
            const provider = entry.parsed.provider;
            if (!result) {
                // Server should return one result per request entry; missing entries are a server bug.
                metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME_FAILURE, 1, { provider });
                continue;
            }

            if (result.isOk()) {
                metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME_SUCCESS, 1, { provider });
                await this.tryDeleteMessage(entry.msg.ReceiptHandle!);
                continue;
            }

            // Per-entry errors:
            // - duplicate_task_name: already scheduled, treat as success and delete.
            // - task_cap_exceeded: the group is saturated, so redelivering won't help — drop the
            //   message (delete) rather than retry it to a DLQ. This is intentional shedding.
            // - anything else: leave for redelivery (SQS visibility timeout → eventual DLQ).
            if (result.error.name === 'duplicate_task_name') {
                metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME_SUCCESS, 1, { provider });
                await this.tryDeleteMessage(entry.msg.ReceiptHandle!);
            } else if (result.error.name === 'task_cap_exceeded') {
                metrics.increment(metrics.Types.WEBHOOK_DISPATCH_TASK_CAP_DROPPED, 1, { provider });
                await this.tryDeleteMessage(entry.msg.ReceiptHandle!);
            } else {
                metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME_FAILURE, 1, { provider });
            }
        }
    }

    private parseMessage(body: string): Result<WebhookDispatchMessage> {
        try {
            const json = JSON.parse(body);
            const result = messageSchema.safeParse(json);
            if (!result.success) {
                return Err('invalid_schema');
            }
            return Ok(result.data);
        } catch (_err) {
            return Err('json_parse');
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
