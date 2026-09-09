import tracer from 'dd-trace';

import db from '@nangohq/database';
import { getFormattedOperation, logContextGetter, OtlpSpan } from '@nangohq/logs';
import {
    accountService,
    configService,
    environmentService,
    errorManager,
    ErrorSourceEnum,
    functionConfigService,
    getApiUrl,
    getEndUserByConnectionId,
    LogActionEnum,
    NangoError,
    secretService
} from '@nangohq/shared';
import { Err, Ok, tagTraceUser } from '@nangohq/utils';

import { bigQueryClient, slackService } from '../clients.js';
import { capping } from '../utils/capping.js';
import { getRunnerFlags } from '../utils/flags.js';
import { pubsub } from '../utils/pubsub.js';
import { startScript } from './operations/start.js';
import { setTaskFailed, setTaskSuccess } from './operations/state.js';

import type { LogContext } from '@nangohq/logs';
import type { OrchestratorTask, TaskFunction } from '@nangohq/nango-orchestrator';
import type { Config } from '@nangohq/shared';
import type {
    CheckpointRange,
    ConnectionJobs,
    DBEnvironment,
    DBFunctionConfig,
    DBFunctionConfigVersion,
    DBSyncConfig,
    DBTeam,
    FunctionRuntime,
    NangoProps,
    RoutingContext,
    SdkLogger,
    TelemetryBag
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { JsonValue } from 'type-fest';

export async function startFunction(task: TaskFunction): Promise<Result<void>> {
    let account: DBTeam | undefined;
    let environment: DBEnvironment | undefined;
    let providerConfig: Config | null | undefined;
    let syncConfig: DBSyncConfig | null = null;
    let endUser: NangoProps['endUser'] | null = null;

    try {
        const accountContext = await tracer.trace('function.prepare.accountContext', async () =>
            accountService.getAccountContext({ environmentId: task.connection.environment_id })
        );
        if (!accountContext) {
            throw new Error('Account and environment not found');
        }
        account = accountContext.account;
        environment = accountContext.environment;
        const plan = accountContext.plan;
        tagTraceUser({ ...accountContext });

        providerConfig = await tracer.trace('function.prepare.providerConfig', async () =>
            configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id)
        );
        if (providerConfig === null) {
            throw new Error(`Provider config not found for connection: ${task.connection.connection_id}`);
        }

        const functions = await tracer.trace('function.prepare.functionConfig', async () =>
            functionConfigService.search(db.knex, {
                environmentId: task.connection.environment_id,
                filter: { integrationKey: task.connection.provider_config_key, name: task.functionName }
            })
        );
        if (functions.isErr()) {
            throw functions.error;
        }
        const func = functions.value[0];
        if (functions.value.length !== 1 || !func) {
            throw new Error(`Function not found: ${task.functionName}`);
        }
        const functionConfig = func.config;
        const functionVersion = func.currentVersion;
        if (!functionConfig.enabled) {
            throw new Error(`Function is disabled: ${task.functionName}`);
        }
        syncConfig = toLegacyConfig(functionConfig, functionVersion);

        const getEndUser = await tracer.trace('function.prepare.endUser', async () => getEndUserByConnectionId(db.knex, { connectionId: task.connection.id }));
        if (getEndUser.isOk()) {
            endUser = { id: getEndUser.value.id, endUserId: getEndUser.value.endUserId, orgId: getEndUser.value.organization?.organizationId || null };
        }

        const now = new Date();
        const logCtx = getLogCtx({
            team: account,
            activityLogId: task.activityLogId,
            environmentId: task.connection.environment_id,
            environmentName: environment.name,
            syncConfig,
            providerConfigKey: task.connection.provider_config_key,
            provider: providerConfig.provider,
            nangoConnectionId: task.connection.id,
            connectionId: task.connection.connection_id,
            startedAt: now
        });

        // capping
        const cappingStatus = await tracer.trace('function.prepare.cappingExecutions', async () =>
            capping.getStatus(plan, 'function_executions', 'function_compute_gbms', 'function_duration_seconds')
        );
        if (cappingStatus.isCapped) {
            const message = cappingStatus.message || 'Your plan limits have been reached. Please upgrade your plan.';
            void logCtx.error(message, { cappingStatus });
            throw new Error(message);
        }

        // Function logs capping is just informational - it does not block functions from running
        // nango.log() will still work, but logs won't be persisted
        const cappingFunctionLogsStatus = await tracer.trace('function.prepare.cappingLogs', async () => capping.getStatus(plan, 'function_logs'));
        if (cappingFunctionLogsStatus.isCapped) {
            const message = cappingFunctionLogsStatus.message || 'Function logs limit has been reached. Function logs will not be saved.';
            void logCtx.warn(message, { cappingFunctionLogsStatus });
        }

        void logCtx.info(`Starting function '${task.functionName}'${formatAttempts(task)}`, {
            input: task.trigger.input,
            function: task.functionName,
            connection: task.connection.connection_id,
            integration: task.connection.provider_config_key
        });

        let sdkLogger: SdkLogger;
        if (cappingFunctionLogsStatus.isCapped) {
            sdkLogger = { level: 'off' };
        } else {
            sdkLogger = await tracer.trace('function.prepare.sdkLogger', async () => environmentService.getSdkLogger(accountContext.environment.id));
        }

        const defaultSecret = await tracer.trace('function.prepare.defaultSecret', async () =>
            secretService.getDefaultSecretForEnv(db.readOnly, accountContext.environment)
        );
        if (defaultSecret.isErr()) {
            return Err(defaultSecret.error);
        }

        const nangoProps: NangoProps = {
            scriptType: 'function',
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
            secretKey: defaultSecret.value.secret,
            nangoConnectionId: task.connection.id,
            attributes: syncConfig.attributes,
            syncConfig,
            debug: false,
            logger: sdkLogger,
            runnerFlags: getRunnerFlags(plan),
            startedAt: now,
            endUser,
            heartbeatTimeoutSecs: task.heartbeatTimeoutSecs,
            integrationConfig: {
                oauth_client_id: providerConfig.oauth_client_id,
                oauth_client_secret: providerConfig.oauth_client_secret,
                custom: providerConfig.custom
            }
        };

        const routingContext: RoutingContext = {
            plan: plan,
            features: syncConfig.features
        };

        const res = await startScript({
            taskId: task.id,
            nangoProps,
            routingContext,
            logCtx: logCtx,
            arg: task.trigger
        });

        if (res.isErr()) {
            throw res.error;
        }

        return Ok(undefined);
    } catch (err) {
        const error = new NangoError('function_failure', { error: err instanceof Error ? err.message : err });
        onFailure({
            connection: {
                id: task.connection.id,
                connection_id: task.connection.connection_id,
                environment_id: task.connection.environment_id,
                provider_config_key: task.connection.provider_config_key
            },
            functionName: task.functionName,
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

export async function handleFunctionSuccess({
    taskId,
    nangoProps,
    output,
    telemetryBag,
    functionRuntime,
    checkpoints
}: {
    taskId: string;
    nangoProps: NangoProps;
    output: JsonValue;
    telemetryBag: TelemetryBag;
    functionRuntime: FunctionRuntime;
    checkpoints: CheckpointRange;
}): Promise<void> {
    const logCtx = getLogCtx(nangoProps);
    const { environment, account } = (await accountService.getAccountContext({ environmentId: nangoProps.environmentId })) || {
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
            functionName: nangoProps.syncConfig.sync_name,
            provider: nangoProps.provider,
            providerConfigKey: nangoProps.providerConfigKey,
            activityLogId: nangoProps.activityLogId,
            runTime: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
            error: new NangoError('function_execution_failure', { error: task.error }),
            team: account,
            environment,
            syncConfig: nangoProps.syncConfig,
            endUser: nangoProps.endUser,
            telemetryBag,
            functionRuntime
        });
        return;
    }

    void logCtx.info(`The function was successfully run${formatAttempts(task)}`, {
        function: nangoProps.syncConfig.sync_name,
        connection: nangoProps.connectionId,
        integration: nangoProps.providerConfigKey,
        meta: { checkpoints }
    });
    void logCtx.enrichOperation({ meta: { checkpoints } });
    void logCtx.success();

    const connection: ConnectionJobs = {
        id: nangoProps.nangoConnectionId,
        connection_id: nangoProps.connectionId,
        environment_id: nangoProps.environmentId,
        provider_config_key: nangoProps.providerConfigKey
    };
    void slackService.removeFailingConnection({
        connection,
        name: nangoProps.syncConfig.sync_name,
        type: 'function',
        originalActivityLogId: nangoProps.activityLogId,
        provider: nangoProps.provider
    });

    void bigQueryClient.insert({
        executionType: 'function',
        connectionId: nangoProps.connectionId,
        internalConnectionId: nangoProps.nangoConnectionId,
        accountId: nangoProps.team.id,
        accountName: nangoProps.team.name,
        scriptName: nangoProps.syncConfig.sync_name,
        scriptType: 'function',
        environmentId: nangoProps.environmentId,
        environmentName: nangoProps.environmentName,
        provider: nangoProps.provider,
        providerConfigKey: nangoProps.providerConfigKey,
        status: 'success',
        syncId: null as unknown as string,
        syncVariant: null as unknown as string,
        scriptVersion: nangoProps.syncConfig.version,
        content: `The function "${nangoProps.syncConfig.sync_name}" completed successfully.`,
        runTimeInSeconds: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
        createdAt: Date.now(),
        internalIntegrationId: nangoProps.syncConfig.nango_config_id,
        endUser: nangoProps.endUser,
        source: nangoProps.syncConfig.source
    });

    void pubsub.publisher.publish({
        subject: 'usage',
        type: 'usage.function_executions',
        payload: {
            value: 1,
            properties: {
                accountId: nangoProps.team.id,
                environmentId: nangoProps.environmentId,
                environmentName: nangoProps.environmentName,
                integrationId: nangoProps.providerConfigKey,
                connectionId: connection.connection_id,
                type: 'function',
                functionName: nangoProps.syncConfig.sync_name,
                success: true,
                telemetryBag,
                runtime: functionRuntime
            }
        }
    });
}

export async function handleFunctionError({
    taskId,
    nangoProps,
    error,
    telemetryBag,
    functionRuntime,
    checkpoints
}: {
    taskId: string;
    nangoProps: NangoProps;
    error: NangoError;
    telemetryBag: TelemetryBag;
    functionRuntime: FunctionRuntime;
    checkpoints: CheckpointRange;
}): Promise<void> {
    const accountAndEnv = await accountService.getAccountContext({ environmentId: nangoProps.environmentId });
    if (!accountAndEnv) {
        throw new Error('Account and environment not found');
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
            functionName: nangoProps.syncConfig.sync_name,
            provider: nangoProps.provider,
            providerConfigKey: nangoProps.providerConfigKey,
            activityLogId: nangoProps.activityLogId,
            runTime: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
            error: new NangoError('function_execution_failure', { error: task.error }),
            team: account,
            environment,
            syncConfig: nangoProps.syncConfig,
            endUser: nangoProps.endUser,
            telemetryBag,
            functionRuntime
        });
        return;
    }

    const logCtx = getLogCtx(nangoProps);
    void logCtx.error(`Function '${nangoProps.syncConfig.sync_name}' failed${formatAttempts(task)}`, {
        error,
        function: nangoProps.syncConfig.sync_name,
        connection: nangoProps.connectionId,
        integration: nangoProps.providerConfigKey,
        meta: { checkpoints }
    });
    void logCtx.enrichOperation({ meta: { checkpoints } });
    if (task.value.attempt === task.value.attemptMax) {
        void logCtx.failed();
    }
    onFailure({
        connection: {
            id: nangoProps.nangoConnectionId,
            connection_id: nangoProps.connectionId,
            environment_id: nangoProps.environmentId,
            provider_config_key: nangoProps.providerConfigKey
        },
        functionName: nangoProps.syncConfig.sync_name,
        provider: nangoProps.provider,
        providerConfigKey: nangoProps.providerConfigKey,
        activityLogId: nangoProps.activityLogId,
        runTime: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
        error,
        team: account,
        environment,
        syncConfig: nangoProps.syncConfig,
        endUser: nangoProps.endUser,
        telemetryBag,
        functionRuntime
    });
}

function onFailure({
    team,
    environment,
    connection,
    functionName,
    provider,
    providerConfigKey,
    activityLogId,
    syncConfig,
    runTime,
    error,
    endUser,
    telemetryBag,
    functionRuntime
}: {
    team?: DBTeam | undefined;
    environment?: DBEnvironment | undefined;
    connection: ConnectionJobs;
    functionName: string;
    provider: string;
    providerConfigKey: string;
    activityLogId: string;
    syncConfig: DBSyncConfig | null;
    runTime: number;
    error: NangoError;
    endUser: NangoProps['endUser'];
    telemetryBag?: TelemetryBag | undefined;
    functionRuntime?: FunctionRuntime | undefined;
}): void {
    if (team && environment) {
        try {
            void slackService.reportFailure({
                account: team,
                environment,
                connection,
                name: functionName,
                type: 'function',
                originalActivityLogId: activityLogId,
                provider
            });
        } catch {
            errorManager.report('slack notification service reported a failure', {
                environmentId: connection.environment_id,
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.FUNCTION,
                metadata: {
                    functionName: functionName,
                    connectionDetails: connection,
                    debug: false
                }
            });
        }

        void bigQueryClient.insert({
            executionType: 'function',
            connectionId: connection.connection_id,
            internalConnectionId: connection.id,
            accountId: team.id,
            accountName: team.name,
            scriptName: functionName,
            scriptType: 'function',
            environmentId: environment.id,
            environmentName: environment.name,
            provider,
            providerConfigKey,
            status: 'failed',
            syncId: null as unknown as string,
            syncVariant: null as unknown as string,
            scriptVersion: syncConfig?.version,
            content: error.message,
            runTimeInSeconds: runTime,
            createdAt: Date.now(),
            internalIntegrationId: syncConfig?.nango_config_id || null,
            endUser,
            source: syncConfig?.source
        });

        void pubsub.publisher.publish({
            subject: 'usage',
            type: 'usage.function_executions',
            payload: {
                value: 1,
                properties: {
                    accountId: team.id,
                    environmentId: environment.id,
                    environmentName: environment.name,
                    integrationId: providerConfigKey,
                    connectionId: connection.connection_id,
                    functionName,
                    type: 'function',
                    success: false,
                    telemetryBag,
                    runtime: functionRuntime
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
                { operation: { type: 'function', action: 'invoke' } },
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

// TODO: refactor NangoProps to support native function config
function toLegacyConfig(config: DBFunctionConfig, version: DBFunctionConfigVersion): DBSyncConfig {
    const features: DBSyncConfig['features'] = version.capabilities.usesCheckpoints ? ['checkpoints'] : [];
    return {
        id: version.id,
        sync_name: config.name,
        nango_config_id: config.nango_config_id,
        file_location: version.file_location,
        version: version.version,
        models: [],
        active: true,
        runs: null,
        model_schema: null,
        environment_id: config.environment_id,
        track_deletes: false,
        type: 'action', // TODO: change to 'function' when runner-sdk supports it
        auto_start: false,
        attributes: {},
        source: version.source,
        metadata: {},
        input: version.input_schema_ref,
        sync_type: null,
        webhook_subscriptions: [],
        enabled: config.enabled,
        models_json_schema: version.json_schema,
        sdk_version: null,
        features,
        created_at: version.created_at,
        updated_at: version.updated_at,
        deleted_at: version.deleted_at
    };
}
