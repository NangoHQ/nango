import db from '@nangohq/database';
import { logContextGetter } from '@nangohq/logs';
import {
    NangoError,
    accountService,
    configService,
    environmentService,
    getApiUrl,
    getEndUserByConnectionId,
    getFunctionConfigRaw,
    secretService
} from '@nangohq/shared';
import { Err, Ok, tagTraceUser } from '@nangohq/utils';

import { startScript } from './operations/start.js';
import { capping } from '../utils/capping.js';
import { getRunnerFlags } from '../utils/flags.js';
import { setTaskFailed, setTaskSuccess } from './operations/state.js';

import type { TaskFunction } from '@nangohq/nango-orchestrator';
import type { Config } from '@nangohq/shared';
import type {
    CheckpointRange,
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

/**
 * Execute a function run.
 *
 * v1 supports connection-bound runs (connection-level webhook URLs, triggerFunction({ connectionId }),
 * CLI --connection). Connection-less routing runs (no bound connection) need environment context
 * independent of a connection and are a follow-up.
 */
export async function startFunction(task: TaskFunction): Promise<Result<void>> {
    let team: DBTeam | undefined;
    let environment: DBEnvironment | undefined;
    let providerConfig: Config | null = null;
    let syncConfig: DBSyncConfig | null = null;
    let endUser: NangoProps['endUser'] | null = null;

    try {
        if (!task.connection) {
            throw new Error(`Connection-less function runs are not supported yet: ${task.functionName} (${task.id})`);
        }
        const connection = task.connection;

        const accountContext = await accountService.getAccountContext({ environmentId: connection.environment_id });
        if (!accountContext) {
            throw new Error(`Account and environment not found`);
        }
        team = accountContext.account;
        environment = accountContext.environment;
        const plan = accountContext.plan;
        tagTraceUser({ ...accountContext });

        providerConfig = await configService.getProviderConfig(task.providerConfigKey, connection.environment_id);
        if (providerConfig === null) {
            throw new Error(`Provider config not found for function: ${task.functionName}`);
        }

        syncConfig = await getFunctionConfigRaw({ environmentId: providerConfig.environment_id, config_id: providerConfig.id!, name: task.functionName });
        if (!syncConfig) {
            throw new Error(`Function not found: ${task.functionName} (${task.id})`);
        }
        if (!syncConfig.enabled) {
            throw new Error(`Function is disabled: ${task.functionName} (${task.id})`);
        }

        const getEndUser = await getEndUserByConnectionId(db.knex, { connectionId: connection.id });
        if (getEndUser.isOk()) {
            endUser = { id: getEndUser.value.id, endUserId: getEndUser.value.endUserId, orgId: getEndUser.value.organization?.organizationId || null };
        }

        const logCtx = logContextGetter.get({ id: String(task.activityLogId), accountId: team.id });
        void logCtx.info(`Starting function '${task.functionName}' (trigger: ${task.trigger?.type ?? 'on-demand'})`, {
            function: task.functionName,
            trigger: task.trigger?.type ?? 'on-demand',
            connection: connection.connection_id,
            integration: connection.provider_config_key
        });

        const cappingStatus = await capping.getStatus(plan, 'function_executions', 'function_compute_gbms');
        if (cappingStatus.isCapped) {
            const message = cappingStatus.message || 'Your plan limits have been reached. Please upgrade your plan.';
            void logCtx.error(message, { cappingStatus });
            throw new Error(message);
        }
        const cappingFunctionLogsStatus = await capping.getStatus(plan, 'function_logs');
        let sdkLogger: SdkLogger;
        if (cappingFunctionLogsStatus.isCapped) {
            sdkLogger = { level: 'off' };
        } else {
            sdkLogger = await environmentService.getSdkLogger(environment.id);
        }

        const defaultSecret = await secretService.getDefaultSecretForEnv(db.readOnly, environment);
        if (defaultSecret.isErr()) {
            return Err(defaultSecret.error);
        }

        const nangoProps: NangoProps = {
            scriptType: 'function',
            host: getApiUrl(),
            team: { id: team.id, name: team.name },
            connectionId: connection.connection_id,
            environmentId: connection.environment_id,
            environmentName: environment.name,
            providerConfigKey: connection.provider_config_key,
            provider: providerConfig.provider,
            activityLogId: logCtx.id,
            secretKey: defaultSecret.value.secret,
            nangoConnectionId: connection.id,
            attributes: syncConfig.attributes,
            syncConfig,
            debug: false,
            logger: sdkLogger,
            runnerFlags: getRunnerFlags(plan),
            endUser,
            startedAt: new Date(),
            heartbeatTimeoutSecs: task.heartbeatTimeoutSecs,
            functionEvent: { ...(task.trigger ? { trigger: task.trigger } : {}), payload: task.input },
            connectionBound: true
        };

        const routingContext: RoutingContext = { plan, features: syncConfig.features };

        const res = await startScript({ taskId: task.id, nangoProps, routingContext, logCtx, input: task.input });
        if (res.isErr()) {
            throw res.error;
        }

        return Ok(undefined);
    } catch (err) {
        const error = new NangoError('function_script_failure', { error: err instanceof Error ? err.message : err });
        await setTaskFailed({ taskId: task.id, error });
        return Err(error);
    }
}

export async function handleFunctionSuccess({
    taskId,
    nangoProps,
    output
}: {
    taskId: string;
    nangoProps: NangoProps;
    output: JsonValue;
    telemetryBag: TelemetryBag;
    functionRuntime: FunctionRuntime;
    checkpoints: CheckpointRange;
}): Promise<void> {
    const logCtx = logContextGetter.get({ id: String(nangoProps.activityLogId), accountId: nangoProps.team.id });
    const task = await setTaskSuccess({ taskId, output });
    if (task.isErr()) {
        void logCtx.error(`Failed to mark function as succeeded`, { error: task.error });
        return;
    }
    void logCtx.info(`The function '${nangoProps.syncConfig.sync_name}' was successfully run`);
    void logCtx.success();
}

export async function handleFunctionError({
    taskId,
    nangoProps,
    error
}: {
    taskId: string;
    nangoProps: NangoProps;
    error: NangoError;
    telemetryBag: TelemetryBag;
    functionRuntime: FunctionRuntime;
    checkpoints: CheckpointRange;
}): Promise<void> {
    const logCtx = logContextGetter.get({ id: String(nangoProps.activityLogId), accountId: nangoProps.team.id });
    const task = await setTaskFailed({ taskId, error });
    if (task.isErr()) {
        void logCtx.error(`Failed to mark function as failed`, { error: task.error });
        return;
    }
    void logCtx.error(`Function '${nangoProps.syncConfig.sync_name}' failed`, { error });
    if (task.value.attempt === task.value.attemptMax) {
        void logCtx.failed();
    }
}
