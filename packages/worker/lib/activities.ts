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
    NangoConnection
} from '@nangohq/shared';
import type { ContinuousSyncArgs, InitialSyncArgs } from './models/Worker';

export async function routeSync(args: InitialSyncArgs): Promise<boolean | object> {
    const { syncId, syncJobId, syncName, activityLogId, nangoConnection } = args;
    const syncConfig: ProviderConfig = (await configService.getProviderConfig(
        nangoConnection?.provider_config_key as string,
        nangoConnection?.account_id as number
    )) as ProviderConfig;

    return syncProvider(syncConfig, syncId, syncJobId, syncName, SyncType.INITIAL, nangoConnection, activityLogId);
}

export async function scheduleAndRouteSync(args: ContinuousSyncArgs): Promise<boolean | object> {
    const { syncId, activityLogId, syncName, nangoConnection } = args;
    // TODO recreate the job id to be in the format created by temporal: nango-syncs.accounts-syncs-schedule-29768402-c6a8-462b-8334-37adf2b76be4-workflow-2023-05-30T08:45:00Z
    const syncJobId = await createSyncJob(syncId as string, SyncType.INCREMENTAL, SyncStatus.RUNNING, '', activityLogId);
    const syncConfig: ProviderConfig = (await configService.getProviderConfig(
        nangoConnection?.provider_config_key as string,
        nangoConnection?.account_id as number
    )) as ProviderConfig;

    return syncProvider(syncConfig, syncId, syncJobId?.id as number, syncName, SyncType.INCREMENTAL, nangoConnection, activityLogId);
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
    existingActivityLogId: number
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
            account_id: nangoConnection?.account_id as number,
            operation_name: syncName
        };
        activityLogId = (await createActivityLog(log)) as number;

        updateJobActivityLogId(syncJobId, activityLogId);
    }

    const syncRun = new syncRunService({
        writeToDb: true,
        syncId,
        syncJobId,
        nangoConnection,
        syncName,
        syncType,
        activityLogId
    });

    const result = syncRun.run();

    return result;
}
