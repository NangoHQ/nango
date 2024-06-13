import { Context, CancelledFailure } from '@temporalio/activity';
import { TimeoutFailure, TerminatedFailure } from '@temporalio/client';
import type {
    Config as ProviderConfig,
    LogLevel,
    ServiceResponse,
    NangoConnection,
    ContinuousSyncArgs,
    InitialSyncArgs,
    PostConnectionScriptArgs,
    ActionArgs,
    WebhookArgs,
    SyncConfig
} from '@nangohq/shared';
import {
    createSyncJob,
    SyncStatus,
    SyncType,
    configService,
    createActivityLog,
    LogActionEnum,
    syncRunService,
    environmentService,
    createActivityLogMessage,
    createActivityLogAndLogMessage,
    ErrorSourceEnum,
    errorManager,
    telemetry,
    updateSyncJobStatus,
    updateLatestJobSyncStatus,
    LogTypes,
    isInitialSyncStillRunning,
    getSyncByIdAndName,
    getLastSyncDate,
    getSyncConfigRaw,
    featureFlags
} from '@nangohq/shared';
import { records as recordsService } from '@nangohq/records';
import { getLogger, stringifyError, errorToObject } from '@nangohq/utils';
import integrationService from './integration.service.js';
import type { LogContext } from '@nangohq/logs';
import { logContextGetter } from '@nangohq/logs';
import { sendSync } from '@nangohq/webhooks';
import { bigQueryClient, slackService } from './clients.js';

const logger = getLogger('Jobs');

export async function routeSync(args: InitialSyncArgs): Promise<boolean | object | null> {
    const { syncId, syncJobId, syncName, nangoConnection, debug } = args;
    let environmentId = nangoConnection?.environment_id;

    const isGloballyEnabled = await featureFlags.isEnabled('orchestrator:schedule', 'global', false);
    const isEnvEnabled = await featureFlags.isEnabled('orchestrator:schedule', `${environmentId}`, false);
    const isOrchestrator = isGloballyEnabled || isEnvEnabled;
    if (isOrchestrator) {
        return true;
    }

    // https://typescript.temporal.io/api/classes/activity.Context
    const context: Context = Context.current();
    if (!nangoConnection?.environment_id) {
        environmentId = (await environmentService.getEnvironmentIdForAccountAssumingProd(nangoConnection.account_id as number)) as number;
    }
    const providerConfig: ProviderConfig = (await configService.getProviderConfig(nangoConnection?.provider_config_key, environmentId)) as ProviderConfig;
    const syncConfig = (await getSyncConfigRaw({
        environmentId: providerConfig.environment_id,
        config_id: providerConfig.id!,
        name: syncName,
        isAction: false
    }))!;

    return syncProvider({
        providerConfig,
        syncConfig,
        syncId: syncId,
        syncJobId: syncJobId,
        syncName,
        syncType: SyncType.INITIAL,
        nangoConnection: { ...nangoConnection, environment_id: environmentId },
        temporalContext: context,
        debug: debug === true
    });
}

export async function runAction(args: ActionArgs): Promise<ServiceResponse> {
    const { input, nangoConnection, actionName, activityLogId } = args;

    const providerConfig: ProviderConfig = (await configService.getProviderConfig(
        nangoConnection?.provider_config_key,
        nangoConnection?.environment_id
    )) as ProviderConfig;

    const context: Context = Context.current();

    const syncRun = new syncRunService({
        bigQueryClient,
        integrationService,
        recordsService,
        slackService,
        writeToDb: true,
        logCtx: await logContextGetter.get({ id: String(activityLogId) }),
        sendSyncWebhook: sendSync,
        nangoConnection,
        syncName: actionName,
        isAction: true,
        syncType: SyncType.ACTION,
        activityLogId,
        input,
        provider: providerConfig.provider,
        debug: false,
        temporalContext: context
    });

    const actionResults = await syncRun.run();

    return actionResults;
}

export async function scheduleAndRouteSync(args: ContinuousSyncArgs): Promise<boolean | object | null> {
    const { syncId, syncName, nangoConnection, debug } = args;
    let environmentId = nangoConnection?.environment_id;
    let syncJobId;

    const isGloballyEnabled = await featureFlags.isEnabled('orchestrator:schedule', 'global', false);
    const isEnvEnabled = await featureFlags.isEnabled('orchestrator:schedule', `${environmentId}`, false);
    const isOrchestrator = isGloballyEnabled || isEnvEnabled;
    if (isOrchestrator) {
        return true;
    }

    const initialSyncStillRunning = await isInitialSyncStillRunning(syncId);

    if (initialSyncStillRunning) {
        const content = `The continuous sync "${syncName}" with sync id ${syncId} did not run because the initial sync is still running. It will attempt to run at the next scheduled time.`;

        logger.log('info', content);

        await telemetry.log(LogTypes.SYNC_OVERLAP, content, LogActionEnum.SYNC, {
            environmentId: String(nangoConnection?.environment_id),
            connectionId: nangoConnection?.connection_id,
            providerConfigKey: nangoConnection?.provider_config_key,
            syncName,
            syncId
        });

        return true;
    }

    // https://typescript.temporal.io/api/classes/activity.Context
    const context: Context = Context.current();
    const lastSyncDate = await getLastSyncDate(syncId);
    const syncType = lastSyncDate ? SyncType.INCREMENTAL : SyncType.INITIAL;
    let providerConfig: ProviderConfig | undefined;
    let syncConfig: SyncConfig | null = null;
    try {
        if (!nangoConnection?.environment_id) {
            environmentId = (await environmentService.getEnvironmentIdForAccountAssumingProd(nangoConnection.account_id as number)) as number;
            syncJobId = await createSyncJob(
                syncId,
                syncType,
                SyncStatus.RUNNING,
                context.info.workflowExecution.workflowId,
                nangoConnection,
                context.info.workflowExecution.runId
            );
        } else {
            syncJobId = await createSyncJob(
                syncId,
                syncType,
                SyncStatus.RUNNING,
                context.info.workflowExecution.workflowId,
                nangoConnection,
                context.info.workflowExecution.runId
            );
        }

        providerConfig = (await configService.getProviderConfig(nangoConnection?.provider_config_key, environmentId)) as ProviderConfig;
        syncConfig = (await getSyncConfigRaw({
            environmentId: providerConfig.environment_id,
            config_id: providerConfig.id!,
            name: syncName,
            isAction: false
        }))!;

        return syncProvider({
            providerConfig,
            syncConfig,
            syncId,
            syncJobId: syncJobId?.id as number,
            syncName,
            syncType,
            nangoConnection: { ...nangoConnection, environment_id: environmentId },
            temporalContext: context,
            debug: debug === true
        });
    } catch (err) {
        const prettyError = stringifyError(err, { pretty: true });
        const log = {
            level: 'info' as LogLevel,
            success: false,
            action: LogActionEnum.SYNC,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: nangoConnection?.connection_id,
            provider_config_key: nangoConnection?.provider_config_key,
            provider: '',
            session_id: '',
            environment_id: environmentId,
            operation_name: syncName
        };
        const content = `The continuous sync failed to run because of a failure to obtain the provider config for ${syncName} with the following error: ${prettyError}`;
        const activityLogId = await createActivityLogAndLogMessage(log, {
            level: 'error',
            environment_id: environmentId,
            timestamp: Date.now(),
            content
        });

        const { account, environment } = (await environmentService.getAccountAndEnvironment({ environmentId: nangoConnection.environment_id }))!;
        const logCtx = await logContextGetter.create(
            { id: String(activityLogId), operation: { type: 'sync', action: 'run' }, message: 'Sync' },
            {
                account,
                environment,
                integration: providerConfig ? { id: providerConfig.id!, name: providerConfig.unique_key, provider: providerConfig.provider } : undefined,
                connection: { id: nangoConnection.id!, name: nangoConnection.connection_id },
                syncConfig: syncConfig ? { id: syncConfig.id!, name: syncConfig.sync_name } : undefined
            }
        );
        await logCtx.error('The continuous sync failed to run because of a failure to obtain the provider config', { error: err, syncName });
        await logCtx.failed();

        await telemetry.log(LogTypes.SYNC_FAILURE, content, LogActionEnum.SYNC, {
            environmentId: String(environmentId),
            connectionId: nangoConnection?.connection_id,
            providerConfigKey: nangoConnection?.provider_config_key,
            syncId,
            syncName,
            level: 'error'
        });

        errorManager.report(content, {
            environmentId,
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.SYNC,
            metadata: {
                syncType,
                connectionId: nangoConnection?.connection_id,
                providerConfigKey: nangoConnection?.provider_config_key,
                syncName
            }
        });

        return false;
    }
}

/**
 * Sync Provider
 * @desc take in a provider, use the nango.yaml config to find
 * the integrations where that provider is used and call the sync
 * accordingly with the user defined integration code
 */
export async function syncProvider({
    providerConfig,
    syncConfig,
    syncId,
    syncJobId,
    syncName,
    syncType,
    nangoConnection,
    temporalContext,
    debug = false
}: {
    providerConfig: ProviderConfig;
    syncConfig: SyncConfig;
    syncId: string;
    syncJobId: number;
    syncName: string;
    syncType: SyncType;
    nangoConnection: NangoConnection;
    temporalContext: Context;
    debug?: boolean;
}): Promise<boolean | object | null> {
    const action = syncType === SyncType.INITIAL ? LogActionEnum.FULL_SYNC : LogActionEnum.SYNC;
    let logCtx: LogContext | undefined;

    try {
        const log = {
            level: 'info' as LogLevel,
            success: null,
            action,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: nangoConnection.connection_id,
            provider_config_key: nangoConnection.provider_config_key,
            provider: providerConfig.provider,
            session_id: syncJobId ? syncJobId?.toString() : '',
            environment_id: nangoConnection.environment_id,
            operation_name: syncName
        };
        const activityLogId = (await createActivityLog(log)) as number;

        const { account, environment } = (await environmentService.getAccountAndEnvironment({ environmentId: nangoConnection.environment_id }))!;
        logCtx = await logContextGetter.create(
            { id: String(activityLogId), operation: { type: 'sync', action: 'run' }, message: 'Sync' },
            {
                account,
                environment,
                integration: { id: providerConfig.id!, name: providerConfig.unique_key, provider: providerConfig.provider },
                connection: { id: nangoConnection.id!, name: nangoConnection.connection_id },
                syncConfig: { id: syncConfig.id!, name: syncConfig.sync_name }
            }
        );

        if (debug) {
            await createActivityLogMessage({
                level: 'info',
                environment_id: nangoConnection?.environment_id,
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content: `Starting sync ${syncType} for ${syncName} with syncId ${syncId} and syncJobId ${syncJobId} with execution id of ${temporalContext.info.workflowExecution.workflowId} for attempt #${temporalContext.info.attempt}`
            });
            await logCtx.info('Starting sync', {
                syncType,
                syncName,
                syncId,
                syncJobId,
                attempt: temporalContext.info.attempt,
                workflowId: temporalContext.info.workflowExecution.workflowId
            });
        }

        const syncRun = new syncRunService({
            bigQueryClient,
            integrationService,
            recordsService,
            slackService,
            sendSyncWebhook: sendSync,
            writeToDb: true,
            syncId,
            syncJobId,
            nangoConnection,
            syncName,
            syncType,
            activityLogId,
            provider: providerConfig.provider,
            temporalContext,
            debug,
            logCtx
        });

        const result = await syncRun.run();

        return result.response;
    } catch (err) {
        const prettyError = stringifyError(err, { pretty: true });
        const log = {
            level: 'info' as LogLevel,
            success: false,
            action,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: nangoConnection?.connection_id,
            provider_config_key: nangoConnection?.provider_config_key,
            provider: providerConfig.provider,
            session_id: syncJobId ? syncJobId?.toString() : '',
            environment_id: nangoConnection?.environment_id,
            operation_name: syncName
        };
        const content = `The ${syncType} sync failed to run because of a failure to create the job and run the sync with the error: ${prettyError}`;

        await createActivityLogAndLogMessage(log, {
            level: 'error',
            environment_id: nangoConnection?.environment_id,
            timestamp: Date.now(),
            content
        });
        if (logCtx) {
            await logCtx.error('Failed to create the job', { error: err });
            await logCtx.failed();
        }

        await telemetry.log(LogTypes.SYNC_OVERLAP, content, action, {
            environmentId: String(nangoConnection?.environment_id),
            syncId,
            connectionId: nangoConnection?.connection_id,
            providerConfigKey: nangoConnection?.provider_config_key,
            syncName
        });

        errorManager.report(content, {
            environmentId: nangoConnection?.environment_id,
            source: ErrorSourceEnum.PLATFORM,
            operation: action,
            metadata: {
                connectionId: nangoConnection?.connection_id,
                providerConfigKey: nangoConnection?.provider_config_key,
                syncType,
                syncName
            }
        });

        return false;
    }
}

export async function runWebhook(args: WebhookArgs): Promise<boolean> {
    const { input, nangoConnection, activityLogId, parentSyncName } = args;

    const providerConfig: ProviderConfig = (await configService.getProviderConfig(
        nangoConnection?.provider_config_key,
        nangoConnection?.environment_id
    )) as ProviderConfig;

    const sync = await getSyncByIdAndName(nangoConnection.id as number, parentSyncName);

    const context: Context = Context.current();

    const syncJobId = await createSyncJob(
        sync?.id as string,
        SyncType.WEBHOOK,
        SyncStatus.RUNNING,
        context.info.workflowExecution.workflowId,
        nangoConnection,
        context.info.workflowExecution.runId
    );

    const syncRun = new syncRunService({
        bigQueryClient,
        integrationService,
        recordsService,
        slackService,
        writeToDb: true,
        nangoConnection,
        sendSyncWebhook: sendSync,
        syncJobId: syncJobId?.id as number,
        syncName: parentSyncName,
        isAction: false,
        syncType: SyncType.WEBHOOK,
        syncId: sync?.id as string,
        isWebhook: true,
        activityLogId,
        logCtx: await logContextGetter.get({ id: String(activityLogId) }),
        input,
        provider: providerConfig.provider,
        debug: false,
        temporalContext: context
    });

    const result = await syncRun.run();

    return result.success;
}

export async function runPostConnectionScript(args: PostConnectionScriptArgs): Promise<ServiceResponse> {
    const { name, nangoConnection, activityLogId, file_location } = args;

    const providerConfig: ProviderConfig = (await configService.getProviderConfig(
        nangoConnection?.provider_config_key,
        nangoConnection?.environment_id
    )) as ProviderConfig;

    const context: Context = Context.current();

    const syncRun = new syncRunService({
        bigQueryClient,
        integrationService,
        recordsService,
        slackService,
        writeToDb: true,
        nangoConnection,
        syncName: name,
        sendSyncWebhook: sendSync,
        isAction: false,
        isPostConnectionScript: true,
        syncType: SyncType.POST_CONNECTION_SCRIPT,
        isWebhook: false,
        activityLogId,
        logCtx: await logContextGetter.get({ id: String(activityLogId) }),
        provider: providerConfig.provider,
        fileLocation: file_location,
        debug: false,
        temporalContext: context
    });

    const result = await syncRun.run();

    return result;
}

export async function reportFailure(
    error: any,
    workflowArguments: InitialSyncArgs | ContinuousSyncArgs | ActionArgs | WebhookArgs | PostConnectionScriptArgs,
    timeout: string,
    max_attempts: number
): Promise<void> {
    const { nangoConnection } = workflowArguments;
    let type = 'webhook';

    let name = '';
    if ('syncName' in workflowArguments) {
        name = workflowArguments.syncName;
        type = 'sync';
    } else if ('actionName' in workflowArguments) {
        name = workflowArguments.actionName;
        type = 'action';
    } else {
        name = workflowArguments.name;
    }

    let content = `The ${type} "${name}" failed `;
    const context: Context = Context.current();

    if (error instanceof CancelledFailure) {
        content += `due to a cancellation.`;
    } else if (error.cause instanceof TerminatedFailure || error.cause?.name === 'TerminatedFailure') {
        content += `due to a termination.`;
    } else if (error.cause instanceof TimeoutFailure || error.cause?.name === 'TimeoutFailure') {
        if (error.cause.timeoutType === 3) {
            content += `due to a timeout with respect to the max schedule length timeout of ${timeout}.`;
        } else {
            content += `due to a timeout and a lack of heartbeat with ${max_attempts} attempts.`;
        }
    } else {
        content += `due to a unknown failure.`;
    }

    await telemetry.log(LogTypes.FLOW_JOB_TIMEOUT_FAILURE, content, LogActionEnum.SYNC, {
        environmentId: String(nangoConnection?.environment_id),
        name,
        connectionId: nangoConnection?.connection_id,
        providerConfigKey: nangoConnection?.provider_config_key,
        error: JSON.stringify(errorToObject(error)), // temporal is wrapping error with an exotic class that is not Error
        info: JSON.stringify(context.info),
        workflowId: context.info.workflowExecution.workflowId,
        runId: context.info.workflowExecution.runId,
        level: 'error'
    });

    if (type === 'sync' && 'syncId' in workflowArguments) {
        if ('syncJobId' in workflowArguments) {
            await updateSyncJobStatus(workflowArguments.syncJobId, SyncStatus.STOPPED);
        } else {
            await updateLatestJobSyncStatus(workflowArguments.syncId, SyncStatus.STOPPED);
        }
    }
}

export async function cancelActivity(workflowArguments: InitialSyncArgs | ContinuousSyncArgs): Promise<void> {
    try {
        const { syncId, nangoConnection } = workflowArguments;

        const environmentId = nangoConnection?.environment_id;

        if ('syncJobId' in workflowArguments) {
            await updateSyncJobStatus(workflowArguments.syncJobId, SyncStatus.STOPPED);
        } else {
            await updateLatestJobSyncStatus(workflowArguments.syncId, SyncStatus.STOPPED);
        }

        await integrationService.cancelScript(syncId, environmentId);
    } catch (e) {
        const content = `The sync "${workflowArguments.syncName}" with sync id ${workflowArguments.syncId} failed to cancel with the following error: ${e instanceof Error ? e.message : stringifyError(e)}`;
        errorManager.report(content, {
            environmentId: workflowArguments.nangoConnection?.environment_id,
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.SYNC,
            metadata: {
                connectionId: workflowArguments.nangoConnection?.connection_id,
                providerConfigKey: workflowArguments.nangoConnection?.provider_config_key,
                syncName: workflowArguments.syncName,
                syncId: workflowArguments.syncId
            }
        });
    }
}
