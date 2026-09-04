import { createHash } from 'node:crypto';

import db from '@nangohq/database';
import { functionConfigService, getSyncConfigsByConfigIdForWebhook } from '@nangohq/shared';
import { metrics, report, runWithConcurrencyLimit } from '@nangohq/utils';

import { envs } from '../env.js';
import { dispatchQueuePublisher } from './dispatch-queue/client.js';
import { SQS_BATCH_MAX_BYTES } from './dispatch-queue/publisher.js';
import { prepareFunctionDispatchExecution } from './dispatchFunction.js';
import { prepareLegacyDispatchExecution } from './dispatchLegacy.js';

import type { DispatchQueuePublisher, PreparedDispatchMessage } from './dispatch-queue/publisher.js';
import type { MatchedFunctionExecution } from './dispatchFunction.js';
import type { LogContextGetter } from '@nangohq/logs';
import type {
    ConnectionInternal,
    DBConnectionDecrypted,
    DBEnvironment,
    DBFunctionConfig,
    DBFunctionConfigVersion,
    DBIntegrationDecrypted,
    DBTeam,
    DispatchMessage,
    HttpRequest
} from '@nangohq/types';

const LARGE_FANOUT_THRESHOLD = 10;
const DISPATCH_PREPARATION_CONCURRENCY = 25;

export type WebhookConnection = DBConnectionDecrypted | ConnectionInternal;

export interface DispatchContext {
    team: DBTeam;
    environment: DBEnvironment;
    integration: DBIntegrationDecrypted;
    request: HttpRequest;
    logContextGetter: LogContextGetter;
}

export type DirectDispatchSource = 'webhook' | 'oversized';

export interface PreparedDispatchExecution<TMessage extends DispatchMessage = DispatchMessage> {
    preparedMessage: PreparedDispatchMessage<TMessage>;
    executeDirect: (source: DirectDispatchSource) => Promise<boolean>;
    onQueued: () => Promise<void>;
    onQueueFailure: () => Promise<void>;
    onOversized: () => Promise<void>;
}

export interface WebhookFunction {
    config: DBFunctionConfig;
    currentVersion: DBFunctionConfigVersion;
}

export async function dispatchWebhookExecutions({
    context,
    connections,
    payload,
    type,
    webhookHeaderValue
}: {
    context: DispatchContext;
    connections: WebhookConnection[];
    type: string | undefined;
    webhookHeaderValue: string | undefined;
    payload: Record<string, any>;
}): Promise<void> {
    const [legacyFunctions, functions] = await Promise.all([
        getSyncConfigsByConfigIdForWebhook(context.environment.id, context.integration.id!),
        findWebhookFunctions(context)
    ]);

    const matchedLegacyExecutions = legacyFunctions.flatMap((syncConfig) => {
        const webhook = findMatchingSubscription({ subscriptions: syncConfig.webhook_subscriptions, type, headerValue: webhookHeaderValue });
        return webhook ? connections.map((connection) => ({ syncConfig, webhook, connection })) : [];
    });

    const matchedFunctionExecutions: MatchedFunctionExecution[] = functions.flatMap((func) => {
        const trigger = func.currentVersion.trigger;
        if (trigger.kind !== 'http') {
            return [];
        }

        const subscription = findMatchingSubscription({ subscriptions: trigger.subscriptions, type, headerValue: webhookHeaderValue });
        return subscription ? connections.map((connection) => ({ config: func.config, version: func.currentVersion, subscription, connection })) : [];
    });

    const preparationTasks: (() => Promise<PreparedDispatchExecution | null>)[] = [
        ...matchedLegacyExecutions.map((execution) => () => prepareLegacyDispatchExecution({ context, execution, payload })),
        ...matchedFunctionExecutions.map((execution) => () => prepareFunctionDispatchExecution({ context, execution, payload }))
    ];
    const preparationResults = await runWithConcurrencyLimit(preparationTasks, DISPATCH_PREPARATION_CONCURRENCY, (prepare) => prepare());
    const executions = preparationResults.filter((execution): execution is PreparedDispatchExecution => execution !== null);

    const publisher = envs.WEBHOOK_INGRESS_USE_DISPATCH_QUEUE ? dispatchQueuePublisher : null;
    if (publisher) {
        await dispatchViaQueue({
            context,
            publisher,
            executions,
            matchedExecutionCount: matchedLegacyExecutions.length + matchedFunctionExecutions.length
        });
    } else {
        await dispatchViaDirect({ context, executions, source: 'webhook' });
    }
}

async function dispatchViaDirect({
    context,
    executions,
    source
}: {
    context: DispatchContext;
    executions: PreparedDispatchExecution[];
    source: DirectDispatchSource;
}): Promise<void> {
    const successes = new Map<DispatchMessage['kind'], number>([
        ['webhook', 0],
        ['function', 0]
    ]);
    for (const execution of executions) {
        if (await execution.executeDirect(source)) {
            const kind = execution.preparedMessage.message.kind;
            successes.set(kind, (successes.get(kind) || 0) + 1);
        }
    }
    if (source === 'webhook') {
        for (const [kind, count] of successes.entries()) {
            metrics.increment(metrics.Types.WEBHOOK_DIRECT_TRIGGER_SUCCESS, count, {
                kind,
                provider: context.integration.provider,
                providerConfigKey: context.integration.unique_key
            });
        }
    }
}

export async function findWebhookFunctions(context: DispatchContext): Promise<WebhookFunction[]> {
    const result = await functionConfigService.search(db.knex, {
        environmentId: context.environment.id,
        filter: {
            integrationKey: context.integration.unique_key,
            enabled: true,
            trigger: { kind: 'http', hasSubscriptions: true }
        }
    });
    if (result.isErr()) {
        report(result.error, {
            context: 'webhook function discovery failed',
            provider: context.integration.provider,
            accountId: context.team.id,
            environmentId: context.environment.id,
            integration: context.integration.unique_key
        });
    } else {
        return result.value;
    }
    return [];
}

async function dispatchViaQueue({
    context,
    publisher,
    executions,
    matchedExecutionCount
}: {
    context: DispatchContext;
    publisher: DispatchQueuePublisher;
    executions: PreparedDispatchExecution[];
    matchedExecutionCount: number;
}): Promise<void> {
    if (executions.length === 0) return;

    if (matchedExecutionCount > LARGE_FANOUT_THRESHOLD) {
        metrics.increment(metrics.Types.WEBHOOK_DISPATCH_LARGE_FANOUT, 1, {
            provider: context.integration.provider,
            accountId: context.team.id,
            environmentId: context.environment.id,
            providerConfigKey: context.integration.unique_key
        });
    }

    const queueEligibleExecutions = executions.filter(({ preparedMessage }) => preparedMessage.byteSize <= SQS_BATCH_MAX_BYTES);
    const oversizedExecutions = executions.filter(({ preparedMessage }) => preparedMessage.byteSize > SQS_BATCH_MAX_BYTES);

    const executionsByKind = new Map<DispatchMessage['kind'], PreparedDispatchExecution[]>();
    for (const execution of queueEligibleExecutions) {
        const kind = execution.preparedMessage.message.kind;
        const group = executionsByKind.get(kind);
        if (group) {
            group.push(execution);
        } else {
            executionsByKind.set(kind, [execution]);
        }
    }

    for (const group of executionsByKind.values()) {
        await publishExecutions({ context, publisher, executions: group });
    }

    if (oversizedExecutions.length > 0) {
        metrics.increment(metrics.Types.WEBHOOK_DISPATCH_BYPASS_OVERSIZE, oversizedExecutions.length, {
            provider: context.integration.provider,
            accountId: context.team.id,
            environmentId: context.environment.id,
            providerConfigKey: context.integration.unique_key
        });

        for (const execution of oversizedExecutions) {
            void execution.onOversized();
        }
        await dispatchViaDirect({ context, executions: oversizedExecutions, source: 'oversized' });
    }
}

async function publishExecutions({
    context,
    publisher,
    executions
}: {
    context: DispatchContext;
    publisher: DispatchQueuePublisher;
    executions: PreparedDispatchExecution[];
}): Promise<void> {
    if (executions.length === 0) return;

    const publishResult = await publisher.publish(
        executions.map(({ preparedMessage }) => preparedMessage),
        `account:${context.team.id}:env:${context.environment.id}`
    );
    const failedActivityLogIds = new Set(publishResult.failedActivityLogIds);
    const unmappedFailureCount = publishResult.failed - failedActivityLogIds.size;

    for (const execution of executions) {
        const activityLogId = execution.preparedMessage.message.activityLogId;
        if (!failedActivityLogIds.has(activityLogId) && unmappedFailureCount === 0) {
            void execution.onQueued();
        } else {
            await execution.onQueueFailure();
        }
    }

    if (unmappedFailureCount > 0) {
        report(new Error('webhook_dispatch_fanout_unmapped_failures'), {
            unmappedFailureCount,
            kind: executions[0]!.preparedMessage.message.kind,
            accountId: context.team.id,
            environmentId: context.environment.id
        });
    }
}

export function computeIdempotencyKey({
    kind,
    environmentId,
    providerConfigKey,
    executionName,
    connectionId,
    activityLogId
}: {
    kind: 'webhook' | 'function';
    environmentId: number;
    providerConfigKey: string;
    executionName: string;
    connectionId: number;
    activityLogId: string;
}): string {
    const hash = createHash('sha256').update(`${kind}:${environmentId}:${providerConfigKey}:${executionName}:${connectionId}:${activityLogId}`).digest('hex');
    return `${kind}:env:${environmentId}:connection:${connectionId}:${hash.slice(0, 32)}`;
}

function findMatchingSubscription({
    subscriptions,
    type,
    headerValue
}: {
    subscriptions: string[] | null | undefined;
    type: string | undefined;
    headerValue: string | undefined;
}): string | undefined {
    return subscriptions?.find((subscription) => subscription === '*' || subscription === type || subscription === headerValue);
}
