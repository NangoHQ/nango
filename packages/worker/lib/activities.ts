import { Context, CancelledFailure } from '@temporalio/activity';
import { TimeoutFailure, TerminatedFailure } from '@temporalio/client';
import {
    createSyncJob,
    SyncStatus,
    SyncType,
    Config as ProviderConfig,
    configService,
    createActivityLog,
    LogLevel,
    LogActionEnum,
    syncRunService,
    ServiceResponse,
    NangoConnection,
    environmentService,
    createActivityLogMessage,
    createActivityLogAndLogMessage,
    ErrorSourceEnum,
    errorManager,
    metricsManager,
    updateSyncJobStatus,
    updateLatestJobSyncStatus,
    MetricTypes,
    isInitialSyncStillRunning,
    initialSyncExists,
    getSyncByIdAndName,
    logger
} from '@nangohq/shared';
import integrationService from './integration.service.js';
import type { WebhookArgs, ContinuousSyncArgs, InitialSyncArgs, ActionArgs } from './models/Worker';

export async function routeSync(args: InitialSyncArgs): Promise<boolean | object | null> {
    const { syncId, syncJobId, syncName, activityLogId, nangoConnection, debug } = args;
    let environmentId = nangoConnection?.environment_id;

    // https://typescript.temporal.io/api/classes/activity.Context
    const context: Context = Context.current();
    if (!nangoConnection?.environment_id) {
        environmentId = (await environmentService.getEnvironmentIdForAccountAssumingProd(nangoConnection.account_id as number)) as number;
    }
    const syncConfig: ProviderConfig = (await configService.getProviderConfig(nangoConnection?.provider_config_key as string, environmentId)) as ProviderConfig;

    return syncProvider(
        syncConfig,
        syncId,
        syncJobId,
        syncName,
        SyncType.INITIAL,
        { ...nangoConnection, environment_id: environmentId },
        activityLogId,
        context,
        debug
    );
}

export async function runAction(args: ActionArgs): Promise<ServiceResponse> {
    const { input, nangoConnection, actionName, activityLogId } = args;

    const syncConfig: ProviderConfig = (await configService.getProviderConfig(
        nangoConnection?.provider_config_key as string,
        nangoConnection?.environment_id as number
    )) as ProviderConfig;

    const context: Context = Context.current();

    const syncRun = new syncRunService({
        integrationService,
        writeToDb: true,
        nangoConnection,
        syncName: actionName,
        isAction: true,
        syncType: SyncType.ACTION,
        activityLogId,
        input,
        provider: syncConfig.provider,
        debug: false,
        temporalContext: context
    });

    const actionResults = await syncRun.run();

    return actionResults;
}

export async function runWebhook(args: WebhookArgs): Promise<boolean> {
    const { input, nangoConnection, activityLogId, parentSyncName } = args;

    const syncConfig: ProviderConfig = (await configService.getProviderConfig(
        nangoConnection?.provider_config_key as string,
        nangoConnection?.environment_id as number
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
        integrationService,
        writeToDb: true,
        nangoConnection,
        syncJobId: syncJobId?.id as number,
        syncName: parentSyncName,
        isAction: false,
        syncType: SyncType.WEBHOOK,
        isWebhook: true,
        activityLogId,
        input,
        provider: syncConfig.provider,
        debug: false,
        temporalContext: context
    });

    const result = await syncRun.run();

    return result.success;
}

export async function scheduleAndRouteSync(args: ContinuousSyncArgs): Promise<boolean | object | null> {
    const { syncId, activityLogId, syncName, nangoConnection, debug } = args;
    let environmentId = nangoConnection?.environment_id;
    let syncJobId;

    const initialSyncStillRunning = await isInitialSyncStillRunning(syncId as string);

    if (initialSyncStillRunning) {
        const content = `The continuous sync "${syncName}" with sync id ${syncId} did not run because the initial sync is still running. It will attempt to run at the next scheduled time.`;

        logger.log('info', content);

        await metricsManager.capture(MetricTypes.SYNC_OVERLAP, content, LogActionEnum.SYNC, {
            environmentId: String(nangoConnection?.environment_id),
            connectionId: nangoConnection?.connection_id as string,
            providerConfigKey: nangoConnection?.provider_config_key as string,
            syncName,
            syncId
        });

        return true;
    }

    // https://typescript.temporal.io/api/classes/activity.Context
    const context: Context = Context.current();
    const syncType = (await initialSyncExists(syncId as string)) ? SyncType.INCREMENTAL : SyncType.INITIAL;
    try {
        if (!nangoConnection?.environment_id) {
            environmentId = (await environmentService.getEnvironmentIdForAccountAssumingProd(nangoConnection.account_id as number)) as number;
            syncJobId = await createSyncJob(
                syncId as string,
                syncType,
                SyncStatus.RUNNING,
                context.info.workflowExecution.workflowId,
                nangoConnection,
                context.info.workflowExecution.runId
            );
        } else {
            syncJobId = await createSyncJob(
                syncId as string,
                syncType,
                SyncStatus.RUNNING,
                context.info.workflowExecution.workflowId,
                nangoConnection,
                context.info.workflowExecution.runId
            );
        }

        const syncConfig: ProviderConfig = (await configService.getProviderConfig(
            nangoConnection?.provider_config_key as string,
            environmentId
        )) as ProviderConfig;

        return syncProvider(
            syncConfig,
            syncId,
            syncJobId?.id as number,
            syncName,
            syncType,
            { ...nangoConnection, environment_id: environmentId },
            activityLogId ?? 0,
            context,
            debug
        );
    } catch (err: any) {
        const prettyError = JSON.stringify(err, ['message', 'name'], 2);
        const log = {
            level: 'info' as LogLevel,
            success: false,
            action: LogActionEnum.SYNC,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: nangoConnection?.connection_id as string,
            provider_config_key: nangoConnection?.provider_config_key as string,
            provider: '',
            session_id: '',
            environment_id: environmentId,
            operation_name: syncName
        };
        const content = `The continuous sync failed to run because of a failure to obtain the provider config for ${syncName} with the following error: ${prettyError}`;
        await createActivityLogAndLogMessage(log, {
            level: 'error',
            environment_id: environmentId,
            timestamp: Date.now(),
            content
        });

        await metricsManager.capture(MetricTypes.SYNC_FAILURE, content, LogActionEnum.SYNC, {
            environmentId: String(environmentId),
            connectionId: nangoConnection?.connection_id as string,
            providerConfigKey: nangoConnection?.provider_config_key as string,
            syncId,
            syncName
        });

        await errorManager.report(content, {
            environmentId,
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.SYNC,
            metadata: {
                syncType,
                connectionId: nangoConnection?.connection_id as string,
                providerConfigKey: nangoConnection?.provider_config_key as string,
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
export async function syncProvider(
    syncConfig: ProviderConfig,
    syncId: string,
    syncJobId: number,
    syncName: string,
    syncType: SyncType,
    nangoConnection: NangoConnection,
    existingActivityLogId: number,
    temporalContext: Context,
    debug = false
): Promise<boolean | object | null> {
    try {
        let activityLogId = existingActivityLogId;

        if (syncType === SyncType.INCREMENTAL || existingActivityLogId === 0) {
            const log = {
                level: 'info' as LogLevel,
                success: null,
                action: LogActionEnum.SYNC,
                start: Date.now(),
                end: Date.now(),
                timestamp: Date.now(),
                connection_id: nangoConnection?.connection_id as string,
                provider_config_key: nangoConnection?.provider_config_key as string,
                provider: syncConfig.provider,
                session_id: syncJobId ? syncJobId?.toString() : '',
                environment_id: nangoConnection?.environment_id as number,
                operation_name: syncName
            };
            activityLogId = (await createActivityLog(log)) as number;
        }

        if (debug) {
            await createActivityLogMessage({
                level: 'info',
                environment_id: nangoConnection?.environment_id as number,
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content: `Starting sync ${syncType} for ${syncName} with syncId ${syncId} and syncJobId ${syncJobId} with execution id of ${temporalContext.info.workflowExecution.workflowId} for attempt #${temporalContext.info.attempt}`
            });
        }

        const syncRun = new syncRunService({
            integrationService,
            writeToDb: true,
            syncId,
            syncJobId,
            nangoConnection,
            syncName,
            syncType,
            activityLogId,
            provider: syncConfig.provider,
            temporalContext,
            debug
        });

        const result = await syncRun.run();

        return result.response;
    } catch (err: any) {
        const prettyError = JSON.stringify(err, ['message', 'name'], 2);
        const log = {
            level: 'info' as LogLevel,
            success: false,
            action: LogActionEnum.SYNC,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: nangoConnection?.connection_id as string,
            provider_config_key: nangoConnection?.provider_config_key as string,
            provider: syncConfig.provider,
            session_id: syncJobId ? syncJobId?.toString() : '',
            environment_id: nangoConnection?.environment_id as number,
            operation_name: syncName
        };
        const content = `The ${syncType} sync failed to run because of a failure to create the job and run the sync with the error: ${prettyError}`;

        await createActivityLogAndLogMessage(log, {
            level: 'error',
            environment_id: nangoConnection?.environment_id as number,
            timestamp: Date.now(),
            content
        });

        await metricsManager.capture(MetricTypes.SYNC_OVERLAP, content, LogActionEnum.SYNC, {
            environmentId: String(nangoConnection?.environment_id),
            syncId,
            connectionId: nangoConnection?.connection_id as string,
            providerConfigKey: nangoConnection?.provider_config_key as string,
            syncName
        });

        await errorManager.report(content, {
            environmentId: nangoConnection?.environment_id as number,
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.SYNC,
            metadata: {
                connectionId: nangoConnection?.connection_id as string,
                providerConfigKey: nangoConnection?.provider_config_key as string,
                syncType,
                syncName
            }
        });

        return false;
    }
}

export async function reportFailure(
    error: any,
    workflowArguments: InitialSyncArgs | ContinuousSyncArgs | ActionArgs | WebhookArgs,
    DEFAULT_TIMEOUT: string,
    MAXIMUM_ATTEMPTS: number
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
    } else if (error.cause instanceof TerminatedFailure || error.cause.name === 'TerminatedFailure') {
        content += `due to a termination.`;
    } else if (error.cause instanceof TimeoutFailure || error.cause.name === 'TimeoutFailure') {
        if (error.cause.timeoutType === 3) {
            content += `due to a timeout with respect to the max schedule length timeout of ${DEFAULT_TIMEOUT}.`;
        } else {
            content += `due to a timeout and a lack of heartbeat with ${MAXIMUM_ATTEMPTS} attempts.`;
        }
    } else {
        content += `due to a unknown failure.`;
    }

    await metricsManager.capture(MetricTypes.FLOW_JOB_TIMEOUT_FAILURE, content, LogActionEnum.SYNC, {
        environmentId: String(nangoConnection?.environment_id),
        name,
        connectionId: nangoConnection?.connection_id as string,
        providerConfigKey: nangoConnection?.provider_config_key as string,
        error: JSON.stringify(error),
        info: JSON.stringify(context.info),
        workflowId: context.info.workflowExecution.workflowId,
        runId: context.info.workflowExecution.runId
    });

    if (type === 'sync' && 'syncId' in workflowArguments) {
        if ('syncJobId' in workflowArguments) {
            await updateSyncJobStatus(workflowArguments.syncJobId, SyncStatus.STOPPED);
        } else {
            await updateLatestJobSyncStatus(workflowArguments.syncId, SyncStatus.STOPPED);
        }
    }
}
