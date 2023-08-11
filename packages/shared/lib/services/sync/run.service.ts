import { loadLocalNangoConfig, nangoConfigFile } from '../nango-config.service.js';
import type { NangoConnection } from '../../models/Connection.js';
import { SyncResult, SyncType, SyncStatus, Job as SyncJob } from '../../models/Sync.js';
import { createActivityLogMessage, createActivityLogMessageAndEnd, updateSuccess as updateSuccessActivityLog } from '../activity/activity.service.js';
import { addSyncConfigToJob, updateSyncJobResult, updateSyncJobStatus } from '../sync/job.service.js';
import { getSyncConfig } from './config.service.js';
import { checkForIntegrationFile } from '../nango-config.service.js';
import { getLastSyncDate, setLastSyncDate, clearLastSyncDate } from './sync.service.js';
import { formatDataRecords } from './data-records.service.js';
import { upsert } from './data.service.js';
import environmentService from '../environment.service.js';
import integationService from './integration.service.js';
import webhookService from '../webhook.service.js';
import { NangoSync } from '../../sdk/sync.js';
import { isCloud, getApiUrl } from '../../utils/utils.js';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';
import type { NangoIntegrationData, NangoConfig, NangoIntegration } from '../../integrations/index.js';
import type { UpsertResponse, UpsertSummary } from '../../models/Data.js';
import { LogActionEnum } from '../../models/Activity.js';
import type { Environment } from '../../models/Environment';

interface SyncRunConfig {
    writeToDb: boolean;
    nangoConnection: NangoConnection;
    syncName: string;
    syncType: SyncType;

    syncId?: string;
    syncJobId?: number;
    activityLogId?: number;

    loadLocation?: string;
    debug?: boolean;
}

export default class SyncRun {
    writeToDb: boolean;
    nangoConnection: NangoConnection;
    syncName: string;
    syncType: SyncType;

    syncId?: string;
    syncJobId?: number;
    activityLogId?: number;
    loadLocation?: string;
    debug?: boolean;

    constructor(config: SyncRunConfig) {
        this.writeToDb = config.writeToDb;
        this.nangoConnection = config.nangoConnection;
        this.syncName = config.syncName;
        this.syncType = config.syncType;

        if (config.syncId) {
            this.syncId = config.syncId;
        }

        if (config.syncJobId) {
            this.syncJobId = config.syncJobId;
        }

        if (config.activityLogId) {
            this.activityLogId = config.activityLogId;
        }

        if (config.loadLocation) {
            this.loadLocation = config.loadLocation;
        }

        if (config.debug) {
            this.debug = config.debug;
        }
    }

    async run(optionalLastSyncDate?: Date | null, bypassEnvironment?: boolean, optionalSecretKey?: string, optionalHost?: string): Promise<boolean | object> {
        if (this.debug) {
            const content = this.loadLocation ? `Looking for a local nango config at ${this.loadLocation}` : `Looking for a sync config for ${this.syncName}`;
            if (this.writeToDb) {
                await createActivityLogMessage({
                    level: 'debug',
                    activity_log_id: this.activityLogId as number,
                    timestamp: Date.now(),
                    content
                });
            } else {
                console.log(content);
            }
        }
        const nangoConfig = this.loadLocation ? await loadLocalNangoConfig(this.loadLocation) : await getSyncConfig(this.nangoConnection, this.syncName);

        if (!nangoConfig) {
            const message = `No sync configuration was found for ${this.syncName}.`;
            if (this.activityLogId) {
                await this.reportFailureForResults(message);
            } else {
                console.error(message);
            }
            return false;
        }

        const { integrations } = nangoConfig as NangoConfig;
        let result = true;

        if (!integrations[this.nangoConnection.provider_config_key] && !this.writeToDb) {
            const message = `The connection you provided which applies to integration "${this.nangoConnection.provider_config_key}" does not match any integration in the ${nangoConfigFile}`;
            console.error(message);

            return false;
        }

        // if there is a matching customer integration code for the provider config key then run it
        if (integrations[this.nangoConnection.provider_config_key]) {
            let environment: Environment | null = null;

            if (!bypassEnvironment) {
                environment = await environmentService.getById(this.nangoConnection.environment_id as number);
            }

            if (!environment && !bypassEnvironment) {
                await this.reportFailureForResults(
                    `No environment was found for ${this.nangoConnection.environment_id}. The sync cannot continue without a valid environment`
                );
                return false;
            }

            const secretKey = optionalSecretKey || (environment ? (environment?.secret_key as string) : '');

            const providerConfigKey = this.nangoConnection.provider_config_key;
            const syncObject = integrations[providerConfigKey] as unknown as { [key: string]: NangoIntegration };

            if (!isCloud()) {
                const { path: integrationFilePath, result: integrationFileResult } = checkForIntegrationFile(this.syncName, this.loadLocation);
                if (!integrationFileResult) {
                    await this.reportFailureForResults(
                        `Integration was attempted to run for ${this.syncName} but no integration file was found at ${integrationFilePath}.`
                    );

                    return false;
                }
            }

            let lastSyncDate: Date | null | undefined = null;

            if (!this.writeToDb) {
                lastSyncDate = optionalLastSyncDate;
            } else {
                lastSyncDate = await getLastSyncDate(this.syncId as string);
                await clearLastSyncDate(this.syncId as string);
            }

            const nango = new NangoSync({
                host: optionalHost || getApiUrl(),
                connectionId: String(this.nangoConnection?.connection_id),
                environmentId: this.nangoConnection?.environment_id as number,
                providerConfigKey: String(this.nangoConnection?.provider_config_key),
                activityLogId: this.activityLogId as number,
                secretKey,
                nangoConnectionId: this.nangoConnection?.id as number,
                syncId: this.syncId,
                syncJobId: this.syncJobId,
                lastSyncDate: lastSyncDate as Date,
                dryRun: !this.writeToDb
            });

            if (this.debug) {
                const content = `Last sync date is ${lastSyncDate}`;
                if (this.writeToDb) {
                    await createActivityLogMessage({
                        level: 'debug',
                        activity_log_id: this.activityLogId as number,
                        timestamp: Date.now(),
                        content
                    });
                } else {
                    console.log(content);
                }
            }

            const syncData = syncObject[this.syncName] as unknown as NangoIntegrationData;
            const { returns: models } = syncData;

            if (syncData.sync_config_id) {
                if (this.debug) {
                    const content = `Sync config id is ${syncData.sync_config_id}`;
                    if (this.writeToDb) {
                        await createActivityLogMessage({
                            level: 'debug',
                            activity_log_id: this.activityLogId as number,
                            timestamp: Date.now(),
                            content
                        });
                    } else {
                        console.log(content);
                    }
                }
                await addSyncConfigToJob(this.syncJobId as number, syncData.sync_config_id);
            }

            try {
                result = true;

                const syncStartDate = new Date();

                const userDefinedResults = await integationService.runScript(
                    this.syncName,
                    this.activityLogId as number,
                    nango,
                    syncData,
                    this.nangoConnection.environment_id,
                    this.writeToDb,
                    this.loadLocation
                );

                if (userDefinedResults === null) {
                    await this.reportFailureForResults(
                        `The integration was run but there was a problem in retrieving the results from the script "${this.syncName}"${
                            syncData?.version ? ` version: ${syncData.version}` : ''
                        }.`
                    );

                    return false;
                }

                if (!this.writeToDb) {
                    return userDefinedResults;
                }

                let i = 0;
                for (const model of models) {
                    if (userDefinedResults[model]) {
                        if (!this.syncId) {
                            continue;
                        }

                        const {
                            success,
                            error,
                            response: formattedResults
                        } = formatDataRecords(userDefinedResults[model], this.nangoConnection.id as number, model, this.syncId, this.syncJobId as number);

                        if (!success || formattedResults === null) {
                            await this.reportFailureForResults(error?.message as string);

                            return false;
                        }

                        if (this.writeToDb && this.activityLogId) {
                            if (formattedResults.length === 0) {
                                await this.reportResults(
                                    model,
                                    { addedKeys: [], updatedKeys: [], deletedKeys: [], affectedInternalIds: [], affectedExternalIds: [] },
                                    i,
                                    models.length,
                                    syncStartDate,
                                    syncData.version
                                );
                            }

                            if (formattedResults.length > 0) {
                                await errorManager.captureWithJustEnvironment(
                                    'sync_script_return_used',
                                    'Data was sent at the end of the integration script instead of using batchSave',
                                    this.nangoConnection.environment_id as number,
                                    LogActionEnum.SYNC,
                                    {
                                        syncName: this.syncName,
                                        connectionDetails: this.nangoConnection,
                                        syncId: this.syncId,
                                        syncJobId: this.syncJobId,
                                        syncType: this.syncType,
                                        debug: this.debug
                                    }
                                );

                                const upsertResult: UpsertResponse = await upsert(
                                    formattedResults,
                                    '_nango_sync_data_records',
                                    'external_id',
                                    this.nangoConnection.id as number,
                                    model,
                                    this.activityLogId
                                );

                                if (upsertResult.success) {
                                    const { summary } = upsertResult;

                                    await this.reportResults(model, summary as UpsertSummary, i, models.length, syncStartDate, syncData.version);
                                }

                                if (!upsertResult.success) {
                                    await this.reportFailureForResults(
                                        `There was a problem upserting the data for ${this.syncName} and the model ${model} with the error message: ${upsertResult?.error}`
                                    );

                                    return false;
                                }
                            }
                        }
                    }
                    i++;
                }
            } catch (e) {
                result = false;
                // if it fails then restore the sync date
                await setLastSyncDate(this.syncId as string, lastSyncDate as Date, false);
                const errorMessage = JSON.stringify(e, ['message', 'name'], 2);
                await this.reportFailureForResults(
                    `The ${this.syncType} "${this.syncName}"${
                        syncData?.version ? ` version: ${syncData?.version}` : ''
                    } sync did not complete successfully and has the following error: ${errorMessage}`
                );
            }
        }

        return result;
    }

    async reportResults(
        model: string,
        responseResults: UpsertSummary,
        index: number,
        numberOfModels: number,
        syncStartDate: Date,
        version?: string
    ): Promise<void> {
        if (!this.writeToDb || !this.activityLogId || !this.syncJobId) {
            return;
        }

        if (index === numberOfModels - 1) {
            await updateSyncJobStatus(this.syncJobId, SyncStatus.SUCCESS);
            await updateSuccessActivityLog(this.activityLogId, true);
            // set the last sync date to when the sync started in case
            // the sync is long running to make sure we wouldn't miss
            // any changes while the sync is running
            // but if the sync date was set by the user in the integration script,
            // then don't override it
            const override = false;
            await setLastSyncDate(this.syncId as string, syncStartDate, override);
        }

        const updatedResults: Record<string, SyncResult> = {
            [model]: {
                added: responseResults.addedKeys.length,
                updated: responseResults.updatedKeys.length,
                deleted: responseResults.deletedKeys?.length as number
            }
        };

        if (responseResults.deletedKeys?.length === 0) {
            delete updatedResults[model]?.deleted;
        }

        const syncResult: SyncJob = await updateSyncJobResult(this.syncJobId, updatedResults, model);

        if (!syncResult) {
            this.reportFailureForResults(`The sync job ${this.syncJobId} could not be updated with the results for the model ${model}.`);
            return;
        }

        const { result } = syncResult;

        let added = 0;
        let updated = 0;
        let deleted = 0;

        if (result && result[model]) {
            const modelResult = result[model] as SyncResult;
            added = modelResult.added;
            updated = modelResult.updated;
            deleted = modelResult.deleted as number;
        } else {
            // legacy json structure
            added = (result?.['added'] as unknown as number) ?? 0;
            updated = (result?.['updated'] as unknown as number) ?? 0;
            deleted = (result?.['deleted'] as unknown as number) ?? 0;
        }

        const successMessage =
            `The ${this.syncType} "${this.syncName}" sync has been completed to the ${model} model.` +
            (version ? ` The version integration script version ran was ${version}.` : '');

        const addedMessage = added > 0 ? `${added} added record${added === 1 ? '' : 's'}` : '';
        const updatedMessage = updated > 0 ? `${updated} updated record${updated === 1 ? '' : 's'}` : '';
        const deletedMessage = deleted > 0 ? `${deleted} deleted record${deleted === 1 ? '' : 's'}` : '';

        const resultMessageParts = [addedMessage, updatedMessage, deletedMessage].filter(Boolean);
        const resultMessage = resultMessageParts.length
            ? `The result was ${resultMessageParts.join(', ')}.`
            : 'The external API returned did not return any new or updated data so nothing was inserted or updated.';

        const content = `${successMessage} ${resultMessage}`;

        const results: SyncResult = {
            added,
            updated
        };

        if (deleted > 0) {
            results['deleted'] = deleted;
        }

        await webhookService.sendUpdate(this.nangoConnection, this.syncName, model, results, this.syncType, syncStartDate, this.activityLogId);

        if (index === numberOfModels - 1) {
            await createActivityLogMessageAndEnd({
                level: 'info',
                activity_log_id: this.activityLogId,
                timestamp: Date.now(),
                content
            });
        } else {
            await createActivityLogMessage({
                level: 'info',
                activity_log_id: this.activityLogId,
                timestamp: Date.now(),
                content
            });
        }

        await errorManager.captureWithJustEnvironment('sync_success', content, this.nangoConnection.environment_id as number, LogActionEnum.SYNC, {
            model,
            responseResults,
            numberOfModels,
            version,
            syncName: this.syncName,
            connectionDetails: this.nangoConnection,
            syncId: this.syncId,
            syncJobId: this.syncJobId,
            syncType: this.syncType,
            debug: this.debug
        });
    }

    async reportFailureForResults(content: string) {
        if (!this.writeToDb || !this.activityLogId || !this.syncJobId) {
            console.error(content);
            return;
        }

        await updateSuccessActivityLog(this.activityLogId, false);
        await updateSyncJobStatus(this.syncJobId, SyncStatus.STOPPED);

        await createActivityLogMessageAndEnd({
            level: 'error',
            activity_log_id: this.activityLogId,
            timestamp: Date.now(),
            content
        });

        await errorManager.report(content, {
            environmentId: this.nangoConnection.environment_id as number,
            source: ErrorSourceEnum.CUSTOMER,
            operation: LogActionEnum.SYNC,
            metadata: {
                syncName: this.syncName,
                connectionDetails: this.nangoConnection,
                syncId: this.syncId,
                syncJobId: this.syncJobId,
                syncType: this.syncType,
                debug: this.debug
            }
        });

        await errorManager.captureWithJustEnvironment('sync_failure', content, this.nangoConnection.environment_id as number, LogActionEnum.SYNC, {
            syncName: this.syncName,
            connectionDetails: this.nangoConnection,
            syncId: this.syncId,
            syncJobId: this.syncJobId,
            syncType: this.syncType,
            debug: this.debug
        });
    }
}
