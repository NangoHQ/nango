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
    const { nangoConnectionId, activityLogId, syncName } = args;
    const sync: Sync = (await createSyncJob(nangoConnectionId, SyncType.INCREMENTAL, syncName)) as Sync;
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
            activityLogId: activityLogId as number
        });
        const providerConfigKey = nangoConnection.provider_config_key;
        const syncObject = integrations[providerConfigKey] as unknown as { [key: string]: NangoIntegration };
        const syncNames = Object.keys(syncObject);
        for (let k = 0; k < syncNames.length; k++) {
            const syncName = syncNames[k] as string;

            if (!checkForIntegrationFile(syncName)) {
                console.log(`No integration file found for ${syncName}`);
                continue;
            }
            const lastSyncDate = await getLastSyncDate(nangoConnection?.id as number, syncName);
            nango.setLastSyncDate(lastSyncDate as Date);
            const syncData = syncObject[syncName] as unknown as NangoIntegrationData;
            const { returns: models } = syncData;
            // TODO this might need to change
            for (const model of models) {
                const integrationClass = await getIntegrationClass(syncName);

                if (!integrationClass) {
                    // log this
                    continue;
                }

                try {
                    const userDefinedResults = await integrationClass.fetchData(nango);

                    let responseResults: UpsertResponse = { addedKeys: [], updatedKeys: [], affectedInternalIds: [], affectedExternalIds: [] };

                    if (userDefinedResults[model]) {
                        const formattedResults = syncDataService.formatDataRecords(userDefinedResults[model], sync.nango_connection_id, model);
                        if (formattedResults.length > 0) {
                            responseResults = await upsert(formattedResults, '_nango_sync_data_records', 'external_id', sync.nango_connection_id);
                        }
                        reportResults(true, sync, activityLogId, model, syncName, responseResults);
                    } else {
                        // not found -- log this
                    }
                } catch (e) {
                    result = false;
                    reportResults(result, sync, activityLogId, model, syncName);
                    // let the user know
                    console.log(e);
                }
            }
        }
    }

    // worker resolves database tables and inserts if exists or creates

    return result;
}

async function reportResults(result: boolean, sync: Sync, activityLogId: number, model: string, syncName: string, responseResults?: UpsertResponse) {
    if (result) {
        await updateSyncStatus(sync.id, SyncStatus.SUCCESS);
        await updateSuccess(activityLogId, true);

        const { addedKeys, updatedKeys } = responseResults as UpsertResponse;

        await createActivityLogMessageAndEnd({
            level: 'info',
            activity_log_id: activityLogId,
            timestamp: Date.now(),
            content: `The ${sync.type} "${syncName}" sync has been completed to the ${model} model, with ${addedKeys.length} added record${
                addedKeys.length === 1 ? '' : 's'
            } and ${updatedKeys.length} updated record${updatedKeys.length === 1 ? '' : 's'}`
        });
    } else {
        await updateSuccessActivityLog(activityLogId, false);

        await createActivityLogMessageAndEnd({
            level: 'error',
            activity_log_id: activityLogId,
            timestamp: Date.now(),
            content: `The ${sync.type} "${syncName}" sync did not complete successfully to the ${model} model`
        });
    }
}

/*
function formatGithubIssue(issues: GithubIssues, nangoConnectionId: number): TicketModel[] {
    const models = [];
    for (const issue of issues) {
        const model = {
            id: uuid.v4(),
            external_id: issue.id, // this is stored as a string, b/c this could be a uuid or even an email address
            title: issue.title,
            description: issue.body as string,
            status: issue.state, // TODO modify this to fit the enum
            external_raw_status: issue.state,
            number_of_comments: issue.comments,
            comments: issue.comments, // TODO fetch comments
            creator: issue?.user?.login as string, // do a more thorough lookup?
            external_created_at: issue.created_at,
            external_updated_at: issue.updated_at,
            deleted_at: null,
            raw_json: issue,
            data_hash: md5(JSON.stringify(issue)),
            nango_connection_id: nangoConnectionId
        };
        models.push(model);
    }
    return models;
}
*/
