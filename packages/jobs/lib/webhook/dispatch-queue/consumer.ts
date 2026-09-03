import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import tracer from 'dd-trace';
import * as z from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { jsonSchema } from '@nangohq/nango-orchestrator';
import { Err, getLogger, metrics, Ok, report } from '@nangohq/utils';

import { envs } from '../../env.js';
import { GroupThrottles } from './groupThrottle.js';
import { changeVisibility, deferSeconds } from './visibility.js';

import type { Message } from '@aws-sdk/client-sqs';
import type { ClientError, ExecuteFunctionBatchProps, ExecuteWebhookProps, OrchestratorClient } from '@nangohq/nango-orchestrator';
import type { DispatchMessage, FunctionDispatchMessage, LegacyDispatchMessage } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('jobs.webhook.dispatch-queue.consumer');

const THROTTLED_LOG_MESSAGE = 'Webhook execution is delayed: this environment reached its webhook dispatch rate limit';

const commonMessageSchema = {
    version: z.literal(1),
    createdAt: z.string().min(1),
    accountId: z.number(),
    integrationId: z.number(),
    provider: z.string(),
    activityLogId: z.string(),
    connection: z.object({
        id: z.number().positive(),
        connection_id: z.string().min(1),
        provider_config_key: z.string().min(1),
        environment_id: z.number().positive()
    })
};

const functionTriggerSchema: z.ZodType<FunctionDispatchMessage['trigger']> = z.object({
    kind: z.literal('http'),
    input: jsonSchema.optional().default(null),
    request: z.object({
        method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
        path: z.string(),
        headers: z.record(z.string(), z.string()),
        query: z.record(z.string(), z.string()),
        body: jsonSchema.optional().default(null)
    }),
    subscriptions: z.array(z.string()),
    connection: z.object({ connectionId: z.string().min(1), integrationId: z.string().min(1) })
});

const messageSchema: z.ZodType<DispatchMessage> = z.discriminatedUnion('kind', [
    z.object({
        ...commonMessageSchema,
        kind: z.literal('webhook'),
        taskName: z.string().min(1),
        parentSyncName: z.string().min(1),
        webhookName: z.string().min(1),
        payload: jsonSchema
    }),
    z.object({
        ...commonMessageSchema,
        kind: z.literal('function'),
        idempotencyKey: z.string().min(1),
        functionName: z.string().min(1),
        trigger: functionTriggerSchema,
        maxConcurrency: z.number().int().min(0)
    })
]);

export interface DispatchQueueConsumerProps {
    queueUrl: string;
    orchestratorClient: OrchestratorClient;
    webhookMaxConcurrency: number;
    consumerConcurrency: number;
    maxMessages: number;
    waitTimeSeconds: number;
    visibilityTimeoutSeconds: number;
    maxAgeMs: number;
    rateLimitThrottleMaxMs: number;
    deferJitterRatio: number;
    taskCapDeferMs: number;
    sqs?: SQSClient;
}

interface ParsedEntry {
    msg: Message;
    parsed: DispatchMessage;
}

interface ParsedLegacyEntry extends ParsedEntry {
    parsed: LegacyDispatchMessage;
}

interface ParsedFunctionEntry extends ParsedEntry {
    parsed: FunctionDispatchMessage;
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
    private readonly throttles: GroupThrottles;
    private readonly deferJitterRatio: number;
    private readonly taskCapDeferMs: number;
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
        this.throttles = new GroupThrottles({ maxThrottleMs: props.rateLimitThrottleMaxMs });
        this.deferJitterRatio = props.deferJitterRatio;
        this.taskCapDeferMs = props.taskCapDeferMs;
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

        const receivedAt = Date.now();
        return void (await tracer.scope().activate(span, async () => {
            try {
                const entries = await this.filterMessages(messages);
                if (entries.length === 0) {
                    return;
                }

                // SQS might deliver the same message multiple times, so we guard against duplicates
                const groups = new Map<string, ParsedEntry[]>();
                for (const entry of entries) {
                    const groupKey = getGroupKey(entry.parsed);
                    const group = groups.get(groupKey);
                    if (group) {
                        group.push(entry);
                    } else {
                        groups.set(groupKey, [entry]);
                    }
                }
                const groupedEntries: ParsedEntry[][] = [];
                const deferrals: Promise<void>[] = [];
                let throttled = 0;
                for (const group of groups.values()) {
                    const remainingMs = this.throttles.remainingMs(dispatchGroupKey(group[0]!.parsed));
                    if (remainingMs > 0) {
                        throttled += group.length;
                        deferrals.push(this.reportThrottled(group), this.deferGroup(group, remainingMs, receivedAt));
                        continue;
                    }
                    groupedEntries.push(group);
                }
                metrics.histogram(metrics.Types.WEBHOOK_DISPATCH_BATCH_SIZE, groupedEntries.length);
                span.setTag('batch_size', groupedEntries.length);
                span.setTag('received', entries.length);
                span.setTag('throttled', throttled);

                if (groupedEntries.length === 0) {
                    await Promise.all(deferrals);
                    return;
                }

                const deferralsDone = Promise.all(deferrals);

                try {
                    const legacyGroups = groupedEntries.filter(isLegacyGroup);
                    const functionGroups = groupedEntries.filter(isFunctionGroup);
                    const [legacyRes, functionRes] = await Promise.all([
                        this.processLegacyGroups(legacyGroups, receivedAt),
                        this.processFunctionGroups(functionGroups, receivedAt)
                    ]);

                    const reportError = ({ err, count }: { err: ClientError; count: number }) => {
                        span.setTag('error', true);
                        span.setTag('error.type', err.name);
                        span.setTag('error.message', err.message);
                        const responsePayload = getClientErrorResponsePayload(err);
                        if (responsePayload) {
                            span.setTag('error.details', responsePayload);
                        }
                        metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME, count, { result: 'failure' });
                        report(new Error('webhook dispatch consumer batch failed', { cause: err }));
                    };

                    if (legacyRes.isErr()) {
                        reportError({ err: legacyRes.error, count: legacyGroups.reduce((count, group) => count + group.length, 0) });
                    }

                    if (functionRes.isErr()) {
                        reportError({ err: functionRes.error, count: functionGroups.reduce((count, group) => count + group.length, 0) });
                    }
                } finally {
                    await deferralsDone;
                }
            } finally {
                span.finish();
            }
        }));
    }

    private async processLegacyGroups(groupedEntries: ParsedLegacyEntry[][], receivedAt: number): Promise<Result<void, ClientError>> {
        if (groupedEntries.length === 0) return Ok(undefined);

        const propsList: ExecuteWebhookProps[] = groupedEntries.map((group) => {
            const message = group[0]!.parsed;
            return {
                name: message.taskName,
                group: { key: `webhook:environment:${message.connection.environment_id}`, maxConcurrency: this.webhookMaxConcurrency },
                args: {
                    webhookName: message.webhookName,
                    parentSyncName: message.parentSyncName,
                    connection: message.connection,
                    activityLogId: message.activityLogId,
                    input: message.payload
                }
            };
        });

        const result = await this.orchestratorClient.executeWebhookBatch(propsList);
        if (result.isErr()) {
            return Err(result.error);
        }

        await this.handleBatchResult(groupedEntries, result.value, receivedAt);
        return Ok(undefined);
    }

    private async processFunctionGroups(groupedEntries: ParsedFunctionEntry[][], receivedAt: number): Promise<Result<void, ClientError>> {
        if (groupedEntries.length === 0) return Ok(undefined);

        const propsList: ExecuteFunctionBatchProps[] = groupedEntries.map((group) => {
            const message = group[0]!.parsed;
            return {
                name: message.idempotencyKey,
                group: {
                    key: `function:environment:${message.connection.environment_id}:connection:${message.connection.id}:function:${message.functionName}`,
                    maxConcurrency: message.maxConcurrency
                },
                retry: { count: 0, max: 0 },
                ownerKey: `environment:${message.connection.environment_id}`,
                args: {
                    functionName: message.functionName,
                    connection: message.connection,
                    activityLogId: message.activityLogId,
                    trigger: message.trigger,
                    async: true
                }
            };
        });

        const result = await this.orchestratorClient.executeFunctionBatch(propsList);
        if (result.isErr()) {
            return Err(result.error);
        }

        await this.handleBatchResult(groupedEntries, result.value, receivedAt);
        return Ok(undefined);
    }

    private async filterMessages(messages: Message[]): Promise<ParsedEntry[]> {
        const entries: ParsedEntry[] = [];
        for (const msg of messages) {
            if (msg.Body === undefined || !msg.ReceiptHandle) {
                continue;
            }

            const parsed = this.parseMessage(msg.Body);
            if (parsed.isErr()) {
                metrics.increment(metrics.Types.WEBHOOK_DISPATCH_DROPPED, 1, { reason: 'poison_pill' });
                await this.tryDeleteMessage(msg.ReceiptHandle);
                continue;
            }

            const message = parsed.value;
            const sentTimestampMs = Number(msg.Attributes?.['SentTimestamp'] ?? '0');
            if (sentTimestampMs > 0) {
                const dwellMs = Date.now() - sentTimestampMs;
                metrics.duration(metrics.Types.WEBHOOK_DISPATCH_DWELL_MS, dwellMs, {
                    provider: message.provider,
                    providerConfigKey: message.connection.provider_config_key
                });

                if (this.maxAgeMs > 0 && dwellMs > this.maxAgeMs) {
                    metrics.increment(metrics.Types.WEBHOOK_DISPATCH_DROPPED, 1, {
                        reason: 'stale',
                        accountId: message.accountId,
                        providerConfigKey: message.connection.provider_config_key
                    });
                    const logCtx = logContextGetter.get({ id: message.activityLogId, accountId: message.accountId });
                    await logCtx.warn('Webhook was discarded: it spent too long in the queue and was not processed.', {
                        dwell_ms: dwellMs,
                        kind: message.kind
                    });
                    await this.tryDeleteMessage(msg.ReceiptHandle);
                    continue;
                }
            }

            entries.push({ msg, parsed: message });
        }
        return entries;
    }

    // Each result applies to every message in its group (deduped SQS copies of the same task).
    private async handleBatchResult<T>(groupedEntries: ParsedEntry[][], results: Result<T, ClientError>[], receivedAt: number): Promise<void> {
        for (let i = 0; i < groupedEntries.length; i++) {
            const group = groupedEntries[i]!;
            const result = results[i];
            const provider = group[0]!.parsed.provider;
            const providerConfigKey = group[0]!.parsed.connection.provider_config_key;
            const count = group.length;
            if (!result) {
                // Server should return one result per request entry; missing entries are a server bug.
                metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME, count, { result: 'failure', provider, providerConfigKey });
                continue;
            }

            if (result.isOk()) {
                metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME, count, { result: 'success', provider, providerConfigKey });
                await this.deleteGroup(group);
                continue;
            }

            // Per-entry errors:
            // - duplicate_task_name: already scheduled, treat as success and delete.
            // - task_cap_exceeded: the group is saturated, leave it for retry as it drains.
            // - rate_limit_exceeded: the group is over its cap, throttle it and defer until that expires.
            // - anything else: leave for redelivery (SQS visibility timeout → eventual DLQ).
            if (result.error.name === 'duplicate_task_name') {
                metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME, count, { result: 'success', provider, providerConfigKey });
                await this.deleteGroup(group);
            } else if (result.error.name === 'rate_limit_exceeded') {
                const groupKey = dispatchGroupKey(group[0]!.parsed);
                this.throttles.throttleFor(groupKey, getRetryAfterMs(result.error.payload));
                metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME, count, { result: 'rate_limited', provider });
                const remainingMs = this.throttles.remainingMs(groupKey);
                if (remainingMs > 0) {
                    await this.deferGroup(group, remainingMs, receivedAt);
                }
                const logCtx = logContextGetter.get({ id: group[0]!.parsed.activityLogId, accountId: group[0]!.parsed.accountId });
                await logCtx.warn(THROTTLED_LOG_MESSAGE);
            } else if (result.error.name === 'task_cap_exceeded') {
                metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME, count, { result: 'task_cap', provider, providerConfigKey });
                if (this.taskCapDeferMs > 0) {
                    await this.deferGroup(group, this.taskCapDeferMs, receivedAt);
                }
            } else {
                metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME, count, { result: 'failure', provider, providerConfigKey });
            }
        }
    }

    private async reportThrottled(group: ParsedEntry[]): Promise<void> {
        const { provider, connection, activityLogId, accountId } = group[0]!.parsed;
        metrics.increment(metrics.Types.WEBHOOK_DISPATCH_CONSUME, group.length, {
            result: 'throttle_deferred',
            provider,
            providerConfigKey: connection.provider_config_key
        });
        try {
            const logCtx = logContextGetter.get({ id: activityLogId, accountId });
            await logCtx.warn(THROTTLED_LOG_MESSAGE);
        } catch (err) {
            report(new Error('webhook dispatch consumer throttle log failed', { cause: err }));
        }
    }

    private async deferGroup(group: ParsedEntry[], delayMs: number, receivedAt: number): Promise<void> {
        const remainingVisibilityMs = this.visibilityTimeoutSeconds * 1000 - (Date.now() - receivedAt);
        if (delayMs <= remainingVisibilityMs) {
            return;
        }
        try {
            await changeVisibility({
                sqs: this.sqs,
                queueUrl: this.queueUrl,
                receiptHandles: group.map((entry) => entry.msg.ReceiptHandle!),
                visibilityTimeoutSeconds: deferSeconds(delayMs, this.deferJitterRatio)
            });
        } catch (err) {
            // Redelivery on the normal visibility timeout is the fallback, so this is not fatal.
            report(new Error('webhook dispatch consumer defer failed', { cause: err }));
        }
    }

    private async deleteGroup(group: ParsedEntry[]): Promise<void> {
        await Promise.all(group.map((entry) => this.tryDeleteMessage(entry.msg.ReceiptHandle!)));
    }

    private parseMessage(body: string): Result<DispatchMessage> {
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

function dispatchGroupKey(message: DispatchMessage): string {
    return `webhook:environment:${message.connection.environment_id}`;
}

function getRetryAfterMs(payload: unknown): number | null {
    if (!payload || typeof payload !== 'object' || !('retryAfterMs' in payload)) {
        return null;
    }
    const retryAfterMs = payload.retryAfterMs;
    return typeof retryAfterMs === 'number' ? retryAfterMs : null;
}

function isLegacyGroup(group: ParsedEntry[]): group is ParsedLegacyEntry[] {
    return group.every((entry) => entry.parsed.kind === 'webhook');
}

function isFunctionGroup(group: ParsedEntry[]): group is ParsedFunctionEntry[] {
    return group.every((entry) => entry.parsed.kind === 'function');
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

function getGroupKey(message: DispatchMessage): string {
    return message.kind === 'webhook' ? message.taskName : message.idempotencyKey;
}
