import db from '@nangohq/database';
import { OtlpSpan, getFormattedOperation, logContextGetter } from '@nangohq/logs';
import {
    ErrorSourceEnum,
    LogActionEnum,
    NangoError,
    configService,
    environmentService,
    errorManager,
    externalWebhookService,
    getApiUrl,
    getEndUserByConnectionId,
    getSyncConfigRaw,
    safeGetPlan
} from '@nangohq/shared';
import { Err, Ok, tagTraceUser } from '@nangohq/utils';
import { sendAsyncActionWebhook } from '@nangohq/webhooks';

import { bigQueryClient, slackService } from '../clients.js';
import { startScript } from './operations/start.js';
import { capping } from '../utils/capping.js';
import { getRunnerFlags } from '../utils/flags.js';
import { setTaskFailed, setTaskSuccess } from './operations/state.js';
import { pubsub } from '../utils/pubsub.js';

import type { LogContext } from '@nangohq/logs';
import type { OrchestratorTask, TaskAction } from '@nangohq/nango-orchestrator';
import type { Config } from '@nangohq/shared';
import type { ConnectionJobs, DBEnvironment, DBSyncConfig, DBTeam, NangoProps, TelemetryBag } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { JsonValue } from 'type-fest';

export async function startAction(task: TaskAction): Promise<Result<void>> {
    let account: DBTeam | undefined;
    let environment: DBEnvironment | undefined;
    let providerConfig: Config | undefined | null;
    let syncConfig: DBSyncConfig | null = null;
    let endUser: NangoProps['endUser'] | null = null;

    try {
        const accountAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: task.connection.environment_id });
        if (!accountAndEnv) {
            throw new Error(`Account and environment not found`);
        }
        account = accountAndEnv.account;
        environment = accountAndEnv.environment;
        const plan = await safeGetPlan(db.knex, { accountId: accountAndEnv.account.id });
        tagTraceUser({ ...accountAndEnv, plan });

        providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
        if (providerConfig === null) {
            throw new Error(`Provider config not found for connection: ${task.connection.connection_id}`);
        }

        syncConfig = await getSyncConfigRaw({
            environmentId: providerConfig.environment_id,
            config_id: providerConfig.id!,
            name: task.actionName,
            isAction: true
        });
        if (!syncConfig) {
            throw new Error(`Action not found: ${task.id}`);
        }
        if (!syncConfig.enabled) {
            throw new Error(`Action is disabled: ${task.id}`);
        }

        const getEndUser = await getEndUserByConnectionId(db.knex, { connectionId: task.connection.id });
        if (getEndUser.isOk()) {
            endUser = { id: getEndUser.value.id, endUserId: getEndUser.value.endUserId, orgId: getEndUser.value.organization?.organizationId || null };
        }

        const now = new Date();
        const logCtx = getLogCtx({
            team: account,
            activityLogId: task.activityLogId,
            environmentId: task.connection.environment_id,
            environmentName: environment.name,
            syncConfig: syncConfig,
            providerConfigKey: task.connection.provider_config_key,
            provider: providerConfig.provider,
            nangoConnectionId: task.connection.id,
            connectionId: task.connection.connection_id,
            startedAt: now
        });

        // capping
        const cappingStatus = await capping.getStatus(plan, 'function_executions', 'function_compute_gbms');
        if (cappingStatus.isCapped) {
            const message = cappingStatus.message || 'Your plan limits have been reached. Please upgrade your plan.';
            void logCtx.error(message, { cappingStatus });
            throw new Error(message);
        }
        // Function logs capping is just informational - it does not block syncs from running
        // nango.log() will still work, but logs won't be persisted
        const cappingFunctionLogsStatus = await capping.getStatus(plan, 'function_logs');
        if (cappingFunctionLogsStatus.isCapped) {
            const message = cappingFunctionLogsStatus.message || 'Function logs limit has been reached. Function logs will not be saved.';
            void logCtx.warn(message, { cappingFunctionLogsStatus });
        }

        void logCtx.info(`Starting action '${task.actionName}'${formatAttempts(task)}`, {
            input: task.input,
            action: task.actionName,
            connection: task.connection.connection_id,
            integration: task.connection.provider_config_key
        });

        const nangoProps: NangoProps = {
            scriptType: 'action',
            host: getApiUrl(),
            team: {
                id: account.id,
                name: account.name
            },
            connectionId: task.connection.connection_id,
            environmentId: task.connection.environment_id,
            environmentName: environment.name,
            providerConfigKey: task.connection.provider_config_key,
            provider: providerConfig.provider,
            activityLogId: task.activityLogId,
            secretKey: environment.secret_key,
            nangoConnectionId: task.connection.id,
            attributes: syncConfig.attributes,
            syncConfig: syncConfig,
            debug: false,
            runnerFlags: {
                ...(await getRunnerFlags()),
                functionLogs: !cappingFunctionLogsStatus.isCapped
            },
            startedAt: now,
            endUser,
            heartbeatTimeoutSecs: task.heartbeatTimeoutSecs
        };

        const res = await startScript({
            taskId: task.id,
            nangoProps,
            logCtx: logCtx,
            input: task.input
        });

        if (res.isErr()) {
            throw res.error;
        }

        return Ok(undefined);
    } catch (err) {
        const error = new NangoError('action_script_failure', { error: err instanceof Error ? err.message : err });
        onFailure({
            connection: {
                id: task.connection.id,
                connection_id: task.connection.connection_id,
                environment_id: task.connection.environment_id,
                provider_config_key: task.connection.provider_config_key
            },
            syncName: task.actionName,
            provider: providerConfig?.provider || 'unknown',
            providerConfigKey: task.connection.provider_config_key,
            activityLogId: task.activityLogId,
            runTime: 0,
            error,
            syncConfig,
            team: account,
            environment: environment,
            endUser
        });
        return Err(error);
    }
}
export async function handleActionSuccess({
    taskId,
    nangoProps,
    output,
    telemetryBag
}: {
    taskId: string;
    nangoProps: NangoProps;
    output: JsonValue;
    telemetryBag: TelemetryBag;
}): Promise<void> {
    const logCtx = getLogCtx(nangoProps);
    const { environment, account } = (await environmentService.getAccountAndEnvironment({ environmentId: nangoProps.environmentId })) || {
        environment: undefined,
        account: undefined
    };

    const task = await setTaskSuccess({ taskId, output });
    if (task.isErr()) {
        onFailure({
            connection: {
                id: nangoProps.nangoConnectionId,
                connection_id: nangoProps.connectionId,
                environment_id: nangoProps.environmentId,
                provider_config_key: nangoProps.providerConfigKey
            },
            syncName: nangoProps.syncConfig.sync_name,
            provider: nangoProps.provider,
            providerConfigKey: nangoProps.providerConfigKey,
            activityLogId: nangoProps.activityLogId,
            runTime: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
            error: new NangoError('action_script_failure', { error: task.error }),
            team: account,
            environment: environment,
            syncConfig: nangoProps.syncConfig,
            endUser: nangoProps.endUser,
            telemetryBag
        });
        return;
    }
    void logCtx.info(`The action was successfully run${formatAttempts(task)}`, {
        action: nangoProps.syncConfig.sync_name,
        connection: nangoProps.connectionId,
        integration: nangoProps.providerConfigKey
    });
    void logCtx.success();

    const connection: ConnectionJobs = {
        id: nangoProps.nangoConnectionId,
        connection_id: nangoProps.connectionId,
        environment_id: nangoProps.environmentId,
        provider_config_key: nangoProps.providerConfigKey
    };
    await slackService.removeFailingConnection({
        connection,
        name: nangoProps.syncConfig.sync_name,
        type: 'action',
        originalActivityLogId: nangoProps.activityLogId as unknown as string,
        provider: nangoProps.provider
    });

    await sendWebhookIfNeeded({
        environment,
        connectionId: nangoProps.connectionId,
        providerConfigKey: nangoProps.providerConfigKey,
        task: task.value,
        logCtx
    });

    void bigQueryClient.insert({
        executionType: 'action',
        connectionId: nangoProps.connectionId,
        internalConnectionId: nangoProps.nangoConnectionId,
        accountId: nangoProps.team?.id,
        accountName: nangoProps.team?.name || 'unknown',
        scriptName: nangoProps.syncConfig.sync_name,
        scriptType: nangoProps.syncConfig.type,
        environmentId: nangoProps.environmentId,
        environmentName: nangoProps.environmentName || 'unknown',
        providerConfigKey: nangoProps.providerConfigKey,
        status: 'success',
        syncId: null as unknown as string,
        syncVariant: null as unknown as string,
        content: `The action "${nangoProps.syncConfig.sync_name}" has been completed successfully.`,
        runTimeInSeconds: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
        createdAt: Date.now(),
        internalIntegrationId: nangoProps.syncConfig.nango_config_id,
        endUser: nangoProps.endUser
    });

    void pubsub.publisher.publish({
        subject: 'usage',
        type: 'usage.function_executions',
        payload: {
            value: 1,
            properties: {
                accountId: nangoProps.team.id,
                connectionId: connection.id,
                type: 'action',
                success: true,
                telemetryBag
            }
        }
    });
}

export async function handleActionError({
    taskId,
    nangoProps,
    error,
    telemetryBag
}: {
    taskId: string;
    nangoProps: NangoProps;
    error: NangoError;
    telemetryBag: TelemetryBag;
}): Promise<void> {
    const accountAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: nangoProps.environmentId });
    if (!accountAndEnv) {
        throw new Error(`Account and environment not found`);
    }
    const { account, environment } = accountAndEnv;

    const task = await setTaskFailed({ taskId, error });
    if (task.isErr()) {
        onFailure({
            connection: {
                id: nangoProps.nangoConnectionId,
                connection_id: nangoProps.connectionId,
                environment_id: nangoProps.environmentId,
                provider_config_key: nangoProps.providerConfigKey
            },
            syncName: nangoProps.syncConfig.sync_name,
            provider: nangoProps.provider,
            providerConfigKey: nangoProps.providerConfigKey,
            activityLogId: nangoProps.activityLogId,
            runTime: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
            error: new NangoError('action_script_failure', { error: task.error }),
            team: account,
            environment: environment,
            syncConfig: nangoProps.syncConfig,
            endUser: nangoProps.endUser,
            telemetryBag
        });
        return;
    }

    const logCtx = getLogCtx(nangoProps);

    void logCtx?.error(`Action '${nangoProps.syncConfig.sync_name}' failed${formatAttempts(task)}`, {
        error,
        action: nangoProps.syncConfig.sync_name,
        connection: nangoProps.connectionId,
        integration: nangoProps.providerConfigKey
    });

    if (task.value.attempt === task.value.attemptMax) {
        void logCtx.failed();
        await sendWebhookIfNeeded({
            environment,
            connectionId: nangoProps.connectionId,
            providerConfigKey: nangoProps.providerConfigKey,
            task: task.value,
            logCtx
        });
    }

    onFailure({
        connection: {
            id: nangoProps.nangoConnectionId,
            connection_id: nangoProps.connectionId,
            environment_id: nangoProps.environmentId,
            provider_config_key: nangoProps.providerConfigKey
        },
        syncName: nangoProps.syncConfig.sync_name,
        provider: nangoProps.provider,
        providerConfigKey: nangoProps.providerConfigKey,
        activityLogId: nangoProps.activityLogId,
        runTime: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
        error,
        team: account,
        environment: environment,
        syncConfig: nangoProps.syncConfig,
        endUser: nangoProps.endUser,
        telemetryBag
    });
}

function onFailure({
    team,
    environment,
    connection,
    syncName,
    provider,
    providerConfigKey,
    activityLogId,
    syncConfig,
    runTime,
    error,
    endUser,
    telemetryBag
}: {
    team?: DBTeam | undefined;
    environment?: DBEnvironment | undefined;
    connection: ConnectionJobs;
    syncName: string;
    provider: string;
    providerConfigKey: string;
    activityLogId: string;
    syncConfig: DBSyncConfig | null;
    runTime: number;
    error: NangoError;
    endUser: NangoProps['endUser'];
    telemetryBag?: TelemetryBag | undefined;
}): void {
    if (team && environment) {
        try {
            void slackService.reportFailure({
                account: team,
                environment,
                connection,
                name: syncName,
                type: 'action',
                originalActivityLogId: activityLogId,
                provider
            });
        } catch {
            errorManager.report('slack notification service reported a failure', {
                environmentId: connection.environment_id,
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.ACTION,
                metadata: {
                    syncName: syncName,
                    connectionDetails: connection,
                    syncType: 'action',
                    debug: false
                }
            });
        }
        void bigQueryClient.insert({
            executionType: 'action',
            connectionId: connection.connection_id,
            internalConnectionId: connection.id,
            accountId: team.id,
            accountName: team.name,
            scriptName: syncName,
            scriptType: 'action',
            environmentId: environment.id,
            environmentName: environment.name,
            providerConfigKey: providerConfigKey,
            status: 'failed',
            syncId: null as unknown as string,
            syncVariant: null as unknown as string,
            content: error.message,
            runTimeInSeconds: runTime,
            createdAt: Date.now(),
            internalIntegrationId: syncConfig?.nango_config_id || null,
            endUser
        });

        void pubsub.publisher.publish({
            subject: 'usage',
            type: 'usage.function_executions',
            payload: {
                value: 1,
                properties: {
                    accountId: team.id,
                    connectionId: connection.id,
                    type: 'action',
                    success: false,
                    telemetryBag
                }
            }
        });
    }
}

function formatAttempts(task: OrchestratorTask | Result<OrchestratorTask>): string {
    const t = 'id' in task ? task : task.isOk() ? task.value : null;
    if (!t) {
        return '';
    }
    return t.attemptMax > 1 ? ` (attempt ${t.attempt}/${t.attemptMax})` : '';
}

async function sendWebhookIfNeeded({
    environment,
    connectionId,
    providerConfigKey,
    task,
    logCtx
}: {
    environment: DBEnvironment | undefined;
    connectionId: string;
    providerConfigKey: string;
    task: OrchestratorTask;
    logCtx: LogContext;
}) {
    if (!task.isAction()) {
        return;
    }
    if (!environment || !task.retryKey || !task.async) {
        return;
    }
    const webhookSettings = await externalWebhookService.get(environment.id);
    if (webhookSettings) {
        await sendAsyncActionWebhook({
            environment: environment,
            connectionId: connectionId,
            providerConfigKey: providerConfigKey,
            payload: {
                id: task.retryKey,
                statusUrl: `/action/${task.retryKey}`
            },
            webhookSettings,
            logCtx
        });
    }
}

function getLogCtx(
    opts: Pick<
        NangoProps,
        | 'team'
        | 'activityLogId'
        | 'environmentId'
        | 'environmentName'
        | 'syncConfig'
        | 'providerConfigKey'
        | 'provider'
        | 'nangoConnectionId'
        | 'connectionId'
        | 'startedAt'
    >
): LogContext {
    const logCtx = logContextGetter.get({ id: opts.activityLogId, accountId: opts.team.id });
    // Origin log context is created in server.
    // Attaching a span here so it is correctly ended when the logCtx operation ends and shows up in exported traces.
    logCtx.attachSpan(
        new OtlpSpan(
            getFormattedOperation(
                { operation: { type: 'action', action: 'run' } },
                {
                    account: opts.team,
                    environment: { id: opts.environmentId, name: opts.environmentName },
                    integration: { id: opts.syncConfig.nango_config_id, name: opts.providerConfigKey, provider: opts.provider },
                    connection: { id: opts.nangoConnectionId, name: opts.connectionId },
                    syncConfig: { id: opts.syncConfig.id, name: opts.syncConfig.sync_name }
                }
            ),
            opts.startedAt
        )
    );
    return logCtx;
}
