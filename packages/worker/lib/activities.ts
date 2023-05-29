import {
    Nango,
    getById as getSyncById,
    updateStatus as updateSyncStatus,
    createSyncJob,
    Sync,
    SyncStatus,
    SyncType,
    Config as ProviderConfig,
    connectionService,
    configService,
    updateSuccess,
    createActivityLog,
    createActivityLogMessage,
    createActivityLogMessageAndEnd,
    UpsertResponse,
    LogLevel,
    LogAction,
    getServerBaseUrl,
    updateSuccess as updateSuccessActivityLog,
    syncDataService,
    NangoIntegration,
    NangoIntegrationData,
    checkForIntegrationFile,
    getIntegrationClass,
    loadNangoConfig,
    getCronExpression,
    getLastSyncDate
} from '@nangohq/shared';
import type { NangoConnection, ContinuousSyncArgs, InitialSyncArgs } from './models/Worker';
import { upsert } from './services/data.service.js';

export async function syncActivity(name: string): Promise<string> {
    return `Synced, ${name}!`;
}

export async function routeSync(args: InitialSyncArgs): Promise<boolean> {
    const { syncId, activityLogId } = args;
    const sync: Sync = (await getSyncById(syncId)) as Sync;
    const nangoConnection = (await connectionService.getConnectionById(sync.nango_connection_id)) as NangoConnection;
    const syncConfig: ProviderConfig = (await configService.getProviderConfig(
        nangoConnection?.provider_config_key as string,
        nangoConnection?.account_id as number
    )) as ProviderConfig;

    return syncProvider(syncConfig, sync, nangoConnection, activityLogId, false);
}

export async function scheduleAndRouteSync(args: ContinuousSyncArgs): Promise<boolean> {
    const { nangoConnectionId, activityLogId, syncName, syncData } = args;
    const frequency = getCronExpression(syncData.runs);
    const sync: Sync = (await createSyncJob(nangoConnectionId, SyncType.INCREMENTAL, syncName, syncData.returns, frequency)) as Sync;
    const nangoConnection: NangoConnection = (await connectionService.getConnectionById(nangoConnectionId)) as NangoConnection;
    const syncConfig: ProviderConfig = (await configService.getProviderConfig(
        nangoConnection?.provider_config_key as string,
        nangoConnection?.account_id as number
    )) as ProviderConfig;

    return syncProvider(syncConfig, sync, nangoConnection, activityLogId, true);
}

/**
 * Sync Provider
 * @desc take in a provider, use the nango.yaml config to find
 * the integrations where that provider is used and call the sync
 * accordingly with the user defined integration code
 */
export async function syncProvider(
    syncConfig: ProviderConfig,
    sync: Sync,
    nangoConnection: NangoConnection,
    existingActivityLogId: number,
    isIncremental: boolean
): Promise<boolean> {
    let activityLogId = existingActivityLogId;

    if (isIncremental) {
        const log = {
            level: 'info' as LogLevel,
            success: false,
            action: 'sync' as LogAction,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: nangoConnection?.connection_id as string,
            provider_config_key: nangoConnection?.provider_config_key as string,
            provider: syncConfig.provider,
            session_id: sync.id.toString(),
            account_id: nangoConnection?.account_id as number
        };
        activityLogId = (await createActivityLog(log)) as number;
    }

    const nangoConfig = loadNangoConfig();

    if (!nangoConfig) {
        return Promise.resolve(false);
    }
    const { integrations } = nangoConfig;
    let result = true;

    // if there is a matching customer integration code for the provider config key then run it
    if (integrations[nangoConnection.provider_config_key]) {
        const nango = new Nango({
            host: getServerBaseUrl(),
            connectionId: String(nangoConnection?.connection_id),
            providerConfigKey: String(nangoConnection?.provider_config_key),
            // pass in the sync id and store the raw json in the database before the user does what they want with it
            // or use the connection ID to match it up
            // either way need a new table
            activityLogId: activityLogId as number,
            isSync: true
        });
        const providerConfigKey = nangoConnection.provider_config_key;
        const syncObject = integrations[providerConfigKey] as unknown as { [key: string]: NangoIntegration };
        const { sync_name: syncName } = sync;

        if (!checkForIntegrationFile(syncName)) {
            await createActivityLogMessage({
                level: 'info',
                activity_log_id: activityLogId,
                content: `Integration was attempted to run for ${syncName} but no integration file was found.`,
                timestamp: Date.now()
            });

            await updateSyncStatus(sync.id, SyncStatus.STOPPED);
            return false;
        }
        const lastSyncDate = await getLastSyncDate(nangoConnection?.id as number, syncName);
        nango.setLastSyncDate(lastSyncDate as Date);
        const syncData = syncObject[syncName] as unknown as NangoIntegrationData;
        const { returns: models } = syncData;

        const integrationClass = await getIntegrationClass(syncName);
        if (!integrationClass) {
            await createActivityLogMessage({
                level: 'info',
                activity_log_id: activityLogId,
                content: `There was a problem loading the integration class for ${syncName}.`,
                timestamp: Date.now()
            });

            await updateSyncStatus(sync.id, SyncStatus.STOPPED);
            return false;
        }

        try {
            result = true;
            const userDefinedResults = await integrationClass.fetchData(nango);

            let responseResults: UpsertResponse = { addedKeys: [], updatedKeys: [], affectedInternalIds: [], affectedExternalIds: [] };

            for (const model of models) {
                if (userDefinedResults[model]) {
                    const formattedResults = syncDataService.formatDataRecords(userDefinedResults[model], sync.nango_connection_id, model);
                    let upsertSuccess = true;
                    if (formattedResults.length > 0) {
                        try {
                            responseResults = await upsert(
                                formattedResults,
                                '_nango_sync_data_records',
                                'external_id',
                                sync.nango_connection_id,
                                model,
                                activityLogId
                            );
                        } catch (e) {
                            const errorMessage = JSON.stringify(e, ['message', 'name', 'stack']);

                            await createActivityLogMessage({
                                level: 'error',
                                activity_log_id: activityLogId,
                                content: `There was a problem upserting the data for ${syncName} and the model ${model}. The error message was ${errorMessage}`,
                                timestamp: Date.now()
                            });
                            upsertSuccess = false;
                        }
                    }
                    reportResults(sync, activityLogId, model, syncName, responseResults, formattedResults.length > 0, upsertSuccess);
                }
            }
        } catch (e) {
            result = false;
            const errorMessage = JSON.stringify(e, ['message', 'name', 'stack']);
            reportFailureForResults(sync, activityLogId, syncName, errorMessage);
            await updateSyncStatus(sync.id, SyncStatus.STOPPED);
        }
    }

    return result;
}

async function reportResults(
    sync: Sync,
    activityLogId: number,
    model: string,
    syncName: string,
    responseResults: UpsertResponse,
    anyResultsInserted: boolean,
    upsertSuccess: boolean
) {
    await updateSyncStatus(sync.id, SyncStatus.SUCCESS);
    await updateSuccess(activityLogId, true);

    const { addedKeys, updatedKeys } = responseResults as UpsertResponse;

    const successMessage = `The ${sync.type} "${syncName}" sync has been completed to the ${model} model.`;

    let resultMessage = '';

    if (!upsertSuccess) {
        resultMessage = `There was an error in upserting the results`;
    } else {
        resultMessage = anyResultsInserted
            ? `The result was ${addedKeys.length} added record${addedKeys.length === 1 ? '' : 's'} and ${updatedKeys.length} updated record${
                  updatedKeys.length === 1 ? '.' : 's.'
              }`
            : 'The external API returned no results so nothing was inserted or updated.';
    }

    const content = `${successMessage} ${resultMessage}`;

    await createActivityLogMessageAndEnd({
        level: 'info',
        activity_log_id: activityLogId,
        timestamp: Date.now(),
        content
    });
}

async function reportFailureForResults(sync: Sync, activityLogId: number, syncName: string, erromessage: string) {
    await updateSuccessActivityLog(activityLogId, false);

    await createActivityLogMessageAndEnd({
        level: 'error',
        activity_log_id: activityLogId,
        timestamp: Date.now(),
        content: `The ${sync.type} "${syncName}" sync did not complete successfully and has the following error: ${erromessage}`
    });
}
