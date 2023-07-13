import {
    createSyncJob,
    SyncStatus,
    SyncType,
    Config as ProviderConfig,
    configService,
    createActivityLog,
    LogLevel,
    LogAction,
    syncRunService,
    updateJobActivityLogId,
    NangoConnection,
    environmentService,
    createActivityLogMessage,
    createActivityLogAndLogMessage
} from '@nangohq/shared';
import type { ContinuousSyncArgs, InitialSyncArgs } from './models/Worker';

export async function routeSync(args: InitialSyncArgs): Promise<boolean | object> {
    const { syncId, syncJobId, syncName, activityLogId, nangoConnection, debug } = args;
    let environmentId = nangoConnection?.environment_id;
    if (!nangoConnection?.environment_id) {
        environmentId = (await environmentService.getEnvironmentIdForAccountAssumingProd(nangoConnection.account_id as number)) as number;

        if (debug) {
            await createActivityLogMessage({
                level: 'info',
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content: `The environment id was not provided for the initial sync: ${syncName}. The environment id was obtained from the account id: ${nangoConnection.account_id} and is: ${environmentId}`
            });
        }
    }
    const syncConfig: ProviderConfig = (await configService.getProviderConfig(nangoConnection?.provider_config_key as string, environmentId)) as ProviderConfig;

    return syncProvider(syncConfig, syncId, syncJobId, syncName, SyncType.INITIAL, { ...nangoConnection, environment_id: environmentId }, activityLogId, debug);
}

export async function scheduleAndRouteSync(args: ContinuousSyncArgs): Promise<boolean | object> {
    const { syncId, activityLogId, syncName, nangoConnection, debug } = args;
    let environmentId = nangoConnection?.environment_id;
    if (!nangoConnection?.environment_id) {
        environmentId = (await environmentService.getEnvironmentIdForAccountAssumingProd(nangoConnection.account_id as number)) as number;

        if (debug) {
            await createActivityLogMessage({
                level: 'info',
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content: `The environment id was not provided for the continuous sync: ${syncName}. The environment id was obtained from the account id: ${nangoConnection.account_id} and is: ${environmentId}`
            });
        }
    }
    // TODO recreate the job id to be in the format created by temporal: nango-syncs.accounts-syncs-schedule-29768402-c6a8-462b-8334-37adf2b76be4-workflow-2023-05-30T08:45:00Z
    const syncJobId = await createSyncJob(syncId as string, SyncType.INCREMENTAL, SyncStatus.RUNNING, '', activityLogId);

    try {
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
            activityLogId,
            debug
        );
    } catch (err: any) {
        const prettyError = JSON.stringify(err, ['message', 'name', 'stack'], 2);
        const log = {
            level: 'info' as LogLevel,
            success: false,
            action: 'sync' as LogAction,
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
        await createActivityLogAndLogMessage(log, {
            level: 'error',
            timestamp: Date.now(),
            content: `The continuous sync failed to run because of a failure to obtain the provider config for ${syncName} with the following error: ${prettyError}`
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
    debug = false
): Promise<boolean | object> {
    let activityLogId = existingActivityLogId;

    if (syncType === SyncType.INCREMENTAL) {
        const log = {
            level: 'info' as LogLevel,
            success: null,
            action: 'sync' as LogAction,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: nangoConnection?.connection_id as string,
            provider_config_key: nangoConnection?.provider_config_key as string,
            provider: syncConfig.provider,
            session_id: syncJobId.toString(),
            environment_id: nangoConnection?.environment_id as number,
            operation_name: syncName
        };
        activityLogId = (await createActivityLog(log)) as number;

        await updateJobActivityLogId(syncJobId, activityLogId);
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
}
