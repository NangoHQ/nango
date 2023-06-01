import {
    Nango,
    updateSyncJobStatus,
    createSyncJob,
    SyncStatus,
    SyncType,
    Config as ProviderConfig,
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
    updateSyncJobResult,
    getLastSyncDate,
    dataService
} from '@nangohq/shared';
import type { NangoConnection, ContinuousSyncArgs, InitialSyncArgs } from './models/Worker';

export async function routeSync(args: InitialSyncArgs): Promise<boolean> {
    const { syncId, syncJobId, syncName, activityLogId, nangoConnection } = args;
    const syncConfig: ProviderConfig = (await configService.getProviderConfig(
        nangoConnection?.provider_config_key as string,
        nangoConnection?.account_id as number
    )) as ProviderConfig;

    return syncProvider(syncConfig, syncId, syncJobId, syncName, SyncType.INITIAL, nangoConnection, activityLogId, false);
}

export async function scheduleAndRouteSync(args: ContinuousSyncArgs): Promise<boolean> {
    const { syncId, activityLogId, syncName, nangoConnection } = args;
    // TODO recreate the job id to be in the format created by temporal: nango-syncs.accounts-syncs-schedule-29768402-c6a8-462b-8334-37adf2b76be4-workflow-2023-05-30T08:45:00Z
    const syncJobId = await createSyncJob(syncId as string, SyncType.INCREMENTAL, SyncStatus.RUNNING, '');
    const syncConfig: ProviderConfig = (await configService.getProviderConfig(
        nangoConnection?.provider_config_key as string,
        nangoConnection?.account_id as number
    )) as ProviderConfig;

    return syncProvider(syncConfig, syncId, syncJobId?.id as number, syncName, SyncType.INCREMENTAL, nangoConnection, activityLogId, true);
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
            session_id: syncJobId.toString(),
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

        // updates to allow the batchSend to work
        nango.setSyncId(syncId);
        nango.setNangoConnectionId(nangoConnection.id as number);
        nango.setSyncJobId(syncJobId);

        const providerConfigKey = nangoConnection.provider_config_key;
        const syncObject = integrations[providerConfigKey] as unknown as { [key: string]: NangoIntegration };

        const { path: integrationFilePath, result: integrationFileResult } = checkForIntegrationFile(syncName);
        if (!integrationFileResult) {
            await createActivityLogMessageAndEnd({
                level: 'info',
                activity_log_id: activityLogId,
                content: `Integration was attempted to run for ${syncName} but no integration file was found at ${integrationFilePath}.`,
                timestamp: Date.now()
            });

            await updateSyncJobStatus(syncJobId, SyncStatus.STOPPED);
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

            await updateSyncJobStatus(syncJobId, SyncStatus.STOPPED);
            return false;
        }

        try {
            result = true;
            const userDefinedResults = await integrationClass.fetchData(nango);

            let responseResults: UpsertResponse | null = { addedKeys: [], updatedKeys: [], affectedInternalIds: [], affectedExternalIds: [] };

            for (const model of models) {
                if (userDefinedResults[model]) {
                    const formattedResults = syncDataService.formatDataRecords(userDefinedResults[model], nangoConnection.id as number, model, syncId);
                    let upsertSuccess = true;
                    if (formattedResults.length > 0) {
                        try {
                            responseResults = await dataService.upsert(
                                formattedResults,
                                '_nango_sync_data_records',
                                'external_id',
                                nangoConnection.id as number,
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
                    if (responseResults) {
                        reportResults(syncJobId, activityLogId, model, syncName, syncType, responseResults, formattedResults.length > 0, upsertSuccess);
                    } else {
                        reportFailureForResults(syncType, activityLogId, syncName, 'There was an issue inserting the incoming data');
                    }
                }
            }
        } catch (e) {
            result = false;
            const errorMessage = JSON.stringify(e, ['message', 'name', 'stack']);
            reportFailureForResults(syncType, activityLogId, syncName, errorMessage);
            await updateSyncJobStatus(syncJobId, SyncStatus.STOPPED);
        }
    }

    return result;
}

async function reportResults(
    syncJobId: number,
    activityLogId: number,
    model: string,
    syncName: string,
    syncType: SyncType,
    responseResults: UpsertResponse,
    anyResultsInserted: boolean,
    upsertSuccess: boolean
) {
    await updateSyncJobStatus(syncJobId, SyncStatus.SUCCESS);
    await updateSuccess(activityLogId, true);
    await updateSyncJobResult(syncJobId, { added: responseResults.addedKeys.length, updated: responseResults.updatedKeys.length });

    const { addedKeys, updatedKeys } = responseResults as UpsertResponse;

    const successMessage = `The ${syncType} "${syncName}" sync has been completed to the ${model} model.`;

    let resultMessage = '';

    if (!upsertSuccess) {
        resultMessage = `There was an error in upserting the results`;
    } else {
        resultMessage = anyResultsInserted
            ? `The result (excluding batch sends) was ${addedKeys.length} added record${addedKeys.length === 1 ? '' : 's'} and ${
                  updatedKeys.length
              } updated record${updatedKeys.length === 1 ? '.' : 's.'}`
            : 'The external API returned no results (excluding earlier batch sends) so nothing was inserted or updated.';
    }

    const content = `${successMessage} ${resultMessage}`;

    await createActivityLogMessageAndEnd({
        level: 'info',
        activity_log_id: activityLogId,
        timestamp: Date.now(),
        content
    });
}

async function reportFailureForResults(syncType: SyncType, activityLogId: number, syncName: string, erromessage: string) {
    await updateSuccessActivityLog(activityLogId, false);

    await createActivityLogMessageAndEnd({
        level: 'error',
        activity_log_id: activityLogId,
        timestamp: Date.now(),
        content: `The ${syncType} "${syncName}" sync did not complete successfully and has the following error: ${erromessage}`
    });
}
