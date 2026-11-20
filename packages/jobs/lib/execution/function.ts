import tracer from 'dd-trace';

import db from '@nangohq/database';
import { getFormattedOperation, logContextGetter, OtlpSpan } from '@nangohq/logs';
import {
    accountService,
    configService,
    environmentService,
    errorManager,
    ErrorSourceEnum,
    functionLookupService,
    getApiUrl,
    getEndUserByConnectionId,
    LogActionEnum,
    NangoError,
    secretService
} from '@nangohq/shared';
import { Err, Ok, tagTraceUser } from '@nangohq/utils';

import { bigQueryClient, slackService } from '../clients.js';
import { envs } from '../env.js';
import { capping } from '../utils/capping.js';
import { getRunnerFlags } from '../utils/flags.js';
import { pubsub } from '../utils/pubsub.js';
import { buildInlineFunction, INLINE_FUNCTION_NAME } from './inlineFunction.js';
import { startScript } from './operations/start.js';
import { setTaskFailed, setTaskSuccess } from './operations/state.js';

import type { LogContext } from '@nangohq/logs';
import type { OrchestratorTask, TaskFunction } from '@nangohq/nango-orchestrator';
import type { Config, ResolvedFunction } from '@nangohq/shared';
import type {
    CheckpointRange,
    ConnectionJobs,
    DBEnvironment,
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
    let logCtx: LogContext | undefined;
    let account: DBTeam | undefined;
    let environment: DBEnvironment | undefined;
    let providerConfig: Config | null | undefined;
    let syncConfig: DBSyncConfig | null = null;
    let endUser: NangoProps['endUser'] | null = null;
    let functionName: string | undefined = task.source ? INLINE_FUNCTION_NAME : undefined;

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
        if (!providerConfig?.id) {
            throw new Error(`Provider config not found for connection: ${task.connection.connection_id}`);
        }

        let inlineCode: string | undefined;
        if (task.source) {
            const built = buildInlineFunction(task.source.code);
            if (built.isErr()) {
                throw built.error;
            }
            inlineCode = built.value;
            tracer.scope().active()?.addTags({ 'function.name': functionName, 'function.uuid': task.functionUuid });
            syncConfig = toInlineConfig({ environmentId: task.connection.environment_id, configId: providerConfig.id });
        } else {
            const resolved = await tracer.trace('function.prepare.functionConfig', async () =>
                functionLookupService.resolveFunctionByUuid({
                    environmentId: task.connection.environment_id,
                    functionUuid: task.functionUuid
                })
            );
            if (resolved.isErr()) {
                throw resolved.error;
            }
            const fn = resolved.value;
            if (!fn) {
                throw new Error(`Function not found: ${task.functionUuid}`);
            }
            if (!fn.enabled) {
                throw new Error(`Function is disabled: ${fn.name}`);
            }
            if (
                (fn.kind === 'deployed' && fn.integration.unique_key !== task.connection.provider_config_key) ||
                (fn.kind === 'catalog' && fn.definition.provider !== providerConfig.provider)
            ) {
                throw new Error(`Function '${task.functionUuid}' does not belong to integration '${task.connection.provider_config_key}'`);
            }
            functionName = fn.name;
            tracer
                .scope()
                .active()
                ?.addTags({
                    'function.name': fn.name,
                    ...(fn.kind === 'deployed' && { 'function.id': fn.definition.function_config_id }),
                    'function.uuid': fn.uuid
                });
            syncConfig = toLegacyConfig(fn, { environmentId: task.connection.environment_id, configId: providerConfig.id });
        }

        const getEndUser = await tracer.trace('function.prepare.endUser', async () => getEndUserByConnectionId(db.knex, { connectionId: task.connection.id }));
        if (getEndUser.isOk()) {
            endUser = { id: getEndUser.value.id, endUserId: getEndUser.value.endUserId, orgId: getEndUser.value.organization?.organizationId || null };
        }

        const now = new Date();
        logCtx = await getLogCtx({
            team: account,
            activityLogId: task.activityLogId,
            environmentId: task.connection.environment_id,
            environmentName: environment.name,
            syncConfig,
            providerConfigKey: task.connection.provider_config_key,
            provider: providerConfig.provider,
            nangoConnectionId: task.connection.id,
            connectionId: task.connection.connection_id,
            startedAt: now,
            meta: { trigger: task.trigger.kind, variant: task.variant ?? 'base', taskId: task.id, ...inlineLogFields(task) }
        });

        // capping
        const cappingStatus = await tracer.trace('function.prepare.cappingExecutions', async () =>
            capping.getStatus(plan, 'function_executions', 'function_compute_gbms', 'function_duration_seconds', 'data_transfer')
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

        void logCtx.info(`Starting function '${functionName}'${formatAttempts(task)}`, {
            input: envs.NANGO_LOG_FUNCTION_INPUT ? task.trigger.input : 'REDACTED',
            function: functionName,
            connection: task.connection.connection_id,
            integration: task.connection.provider_config_key,
            ...inlineLogFields(task)
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
            throw defaultSecret.error;
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
            activityLogId: logCtx.id,
            secretKey: defaultSecret.value.secret,
            nangoConnectionId: task.connection.id,
            variant: task.variant,
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
            arg: task.trigger,
            code: inlineCode
        });

        if (res.isErr()) {
            throw res.error;
        }

        return Ok(undefined);
    } catch (err) {
        const error = new NangoError('function_failure', { error: err instanceof Error ? err.message : err });
        // Only finalize the operation we created by the execution.
        // When an activityLogId is provided (ex: triggered via API), the caller owns the operation and finalizes it.
        if (!task.activityLogId) {
            void logCtx?.error(error.message, { error });
            void logCtx?.failed();
        }
        onFailure({
            connection: {
                id: task.connection.id,
                connection_id: task.connection.connection_id,
                environment_id: task.connection.environment_id,
                provider_config_key: task.connection.provider_config_key
            },
            functionName: functionName || task.functionUuid, // fallback to functionUuid if failure happened before fetching the function config
            provider: providerConfig?.provider || 'unknown',
            providerConfigKey: task.connection.provider_config_key,
            activityLogId: logCtx?.id ?? task.activityLogId,
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
    const logCtx = await getLogCtx(nangoProps);
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

    const logCtx = await getLogCtx(nangoProps);
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
    activityLogId?: string | undefined;
    syncConfig: DBSyncConfig | null;
    runTime: number;
    error: NangoError;
    endUser: NangoProps['endUser'];
    telemetryBag?: TelemetryBag | undefined;
    functionRuntime?: FunctionRuntime | undefined;
}): void {
    if (team && environment) {
        if (activityLogId) {
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

async function getLogCtx(
    opts: Pick<
        NangoProps,
        'team' | 'environmentId' | 'environmentName' | 'syncConfig' | 'providerConfigKey' | 'provider' | 'nangoConnectionId' | 'connectionId' | 'startedAt'
    > & { activityLogId?: string | undefined; meta?: Record<string, string> }
): Promise<LogContext> {
    const context = {
        account: opts.team,
        environment: { id: opts.environmentId, name: opts.environmentName },
        integration: { id: opts.syncConfig.nango_config_id, name: opts.providerConfigKey, provider: opts.provider },
        connection: { id: opts.nangoConnectionId, name: opts.connectionId },
        syncConfig: { ...(opts.syncConfig.id !== 0 && { id: opts.syncConfig.id }), name: opts.syncConfig.sync_name },
        ...(opts.meta && { meta: opts.meta })
    };
    const logCtx = opts.activityLogId
        ? logContextGetter.get({ id: opts.activityLogId, accountId: opts.team.id })
        : await logContextGetter.create(
              { operation: { type: 'function', action: 'invoke' }, expiresAt: new Date(opts.startedAt.getTime() + 24 * 60 * 60 * 1000).toISOString() },
              context
          );
    // Attaching a span here so it is correctly ended when the logCtx operation ends and shows up in exported traces.
    logCtx.attachSpan(new OtlpSpan(getFormattedOperation({ operation: { type: 'function', action: 'invoke' } }, context), opts.startedAt));
    return logCtx;
}

function inlineLogFields(task: TaskFunction): Record<string, string> {
    if (!task.source) {
        return {};
    }
    return { source: task.source.kind, ...(task.source.description && { description: task.source.description }) };
}

// TODO: refactor NangoProps to support native function config
function toLegacyConfig(fn: ResolvedFunction, { environmentId, configId }: { environmentId: number; configId: number }): DBSyncConfig {
    const version = fn.definition;
    const deployed = fn.kind === 'deployed' ? fn.definition : undefined;
    const now = new Date();
    const features: DBSyncConfig['features'] = version.capabilities.usesCheckpoints ? ['checkpoints'] : [];
    return {
        // Catalog functions have no database version ID; 0 is only a legacy runner-config placeholder.
        id: deployed?.id ?? 0,
        sync_name: fn.name,
        nango_config_id: configId,
        file_location: fn.kind === 'deployed' ? fn.definition.file_location : fn.definition.location.js,
        version: version.version,
        models: [],
        active: true,
        runs: null,
        model_schema: null,
        environment_id: environmentId,
        track_deletes: false,
        type: 'action', // TODO: change to 'function' when runner-sdk supports it
        auto_start: false,
        attributes: {},
        source: version.source,
        metadata: {},
        input: version.input_schema_ref,
        sync_type: null,
        webhook_subscriptions: [],
        enabled: true,
        models_json_schema: version.json_schema,
        sdk_version: fn.kind === 'catalog' ? fn.definition.sdkVersion : null,
        features,
        created_at: deployed?.created_at ?? now,
        updated_at: deployed?.updated_at ?? now,
        deleted_at: deployed?.deleted_at ?? null
    };
}

function toInlineConfig({ environmentId, configId }: { environmentId: number; configId: number }): DBSyncConfig {
    const now = new Date();
    return {
        id: 0,
        sync_name: INLINE_FUNCTION_NAME,
        nango_config_id: configId,
        file_location: '',
        version: '0.0.0',
        models: [],
        active: true,
        runs: null,
        model_schema: null,
        environment_id: environmentId,
        track_deletes: false,
        type: 'action',
        auto_start: false,
        attributes: {},
        source: 'standalone',
        metadata: {},
        input: null,
        sync_type: null,
        webhook_subscriptions: [],
        enabled: true,
        models_json_schema: null,
        sdk_version: null,
        features: [],
        created_at: now,
        updated_at: now,
        deleted_at: null
    };
}
