import { Context } from '@temporalio/activity';
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
    NangoConnection,
    environmentService,
    createActivityLogMessage,
    createActivityLogAndLogMessage,
    ErrorSourceEnum,
    errorManager,
    isInitialSyncStillRunning,
    logger
} from '@nangohq/shared';
import type { ContinuousSyncArgs, InitialSyncArgs } from './models/Worker';

export async function routeSync(args: InitialSyncArgs): Promise<boolean | object> {
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

export async function scheduleAndRouteSync(args: ContinuousSyncArgs): Promise<boolean | object> {
    const { syncId, activityLogId, syncName, nangoConnection, debug } = args;
    let environmentId = nangoConnection?.environment_id;
    let syncJobId;

    const initialSyncStillRunning = await isInitialSyncStillRunning(syncId as string);

    if (initialSyncStillRunning) {
        const content = `The continuous sync "${syncName}" with sync id ${syncId} did not run because the initial sync is still running. It will attempt to run at the next scheduled time.`;

        logger.log('info', content);

        await errorManager.captureWithJustEnvironment('sync_overlap', content, environmentId, LogActionEnum.SYNC, {
            connectionId: nangoConnection?.connection_id as string,
            providerConfigKey: nangoConnection?.provider_config_key as string,
            syncName,
            syncId
        });

        return true;
    }

    // https://typescript.temporal.io/api/classes/activity.Context
    const context: Context = Context.current();
    try {
        if (!nangoConnection?.environment_id) {
            environmentId = (await environmentService.getEnvironmentIdForAccountAssumingProd(nangoConnection.account_id as number)) as number;
            syncJobId = await createSyncJob(
                syncId as string,
                SyncType.INCREMENTAL,
                SyncStatus.RUNNING,
                context.info.workflowExecution.workflowId,
                nangoConnection
            );
        } else {
            syncJobId = await createSyncJob(
                syncId as string,
                SyncType.INCREMENTAL,
                SyncStatus.RUNNING,
                context.info.workflowExecution.workflowId,
                nangoConnection
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
            SyncType.INCREMENTAL,
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
            timestamp: Date.now(),
            content
        });

        await errorManager.captureWithJustEnvironment('sync_failure', content, environmentId, LogActionEnum.SYNC, {
            connectionId: nangoConnection?.connection_id as string,
            providerConfigKey: nangoConnection?.provider_config_key as string,
            syncName
        });

        await errorManager.report(content, {
            environmentId,
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.SYNC,
            metadata: {
                syncType: SyncType.INCREMENTAL,
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
): Promise<boolean | object> {
    try {
        let activityLogId = existingActivityLogId;

        if (syncType === SyncType.INCREMENTAL) {
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
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content: `Starting sync ${syncType} for ${syncName} with syncId ${syncId} and syncJobId ${syncJobId} with execution id of ${temporalContext.info.workflowExecution.workflowId} for attempt #${temporalContext.info.attempt}`
            });
        }

        const syncRun = new syncRunService({
            writeToDb: true,
            syncId,
            syncJobId,
            nangoConnection,
            syncName,
            syncType,
            activityLogId,
            debug
        });

        const result = await syncRun.run();

        return result as boolean;
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
            timestamp: Date.now(),
            content
        });

        await errorManager.captureWithJustEnvironment('sync_failure', content, nangoConnection?.environment_id as number, LogActionEnum.SYNC, {
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
