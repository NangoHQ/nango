import type { Context } from '@temporalio/activity';
import { loadLocalNangoConfig, nangoConfigFile } from '../nango-config.service.js';
import type { NangoConnection } from '../../models/Connection.js';
import { SyncResult, SyncType, SyncStatus, Job as SyncJob, IntegrationServiceInterface } from '../../models/Sync.js';
import type { ServiceResponse } from '../../models/Generic.js';
import { createActivityLogMessage, createActivityLogMessageAndEnd, updateSuccess as updateSuccessActivityLog } from '../activity/activity.service.js';
import { addSyncConfigToJob, updateSyncJobResult, updateSyncJobStatus } from '../sync/job.service.js';
import { getSyncConfig } from './config/config.service.js';
import localFileService from '../file/local.service.js';
import { getLastSyncDate, setLastSyncDate, clearLastSyncDate } from './sync.service.js';
import { formatDataRecords } from './data/records.service.js';
import { upsert } from './data/data.service.js';
import { getDeletedKeys, takeSnapshot, clearOldRecords, syncUpdateAtForDeletedRecords } from './data/delete.service.js';
import environmentService from '../environment.service.js';
import slackNotificationService from './notification/slack.service.js';
import webhookService from './notification/webhook.service.js';
import { isCloud, getApiUrl, JAVASCRIPT_PRIMITIVES } from '../../utils/utils.js';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';
import { NangoError } from '../../utils/error.js';
import metricsManager, { MetricTypes } from '../../utils/metrics.manager.js';
import type { NangoIntegrationData, NangoIntegration } from '../../models/NangoConfig.js';
import type { UpsertResponse, UpsertSummary } from '../../models/Data.js';
import { LogActionEnum } from '../../models/Activity.js';
import type { Environment } from '../../models/Environment';
import type { Metadata } from '../../models/Connection';

interface SyncRunConfig {
    integrationService: IntegrationServiceInterface;
    writeToDb: boolean;
    isAction?: boolean;
    isInvokedImmediately?: boolean;
    isWebhook?: boolean;
    nangoConnection: NangoConnection;
    syncName: string;
    syncType: SyncType;

    syncId?: string;
    syncJobId?: number;
    activityLogId?: number;
    provider?: string;

    loadLocation?: string;
    debug?: boolean;
    input?: object;

    logMessages?: unknown[] | undefined;
    stubbedMetadata?: Metadata | undefined;

    temporalContext?: Context;
}

export default class SyncRun {
    integrationService: IntegrationServiceInterface;
    writeToDb: boolean;
    isAction: boolean;
    isInvokedImmediately: boolean;
    nangoConnection: NangoConnection;
    syncName: string;
    syncType: SyncType;

    syncId?: string;
    syncJobId?: number;
    activityLogId?: number;
    provider?: string;
    loadLocation?: string;
    debug?: boolean;
    input?: object;

    logMessages?: unknown[] | undefined = [];
    stubbedMetadata?: Metadata | undefined = undefined;

    temporalContext?: Context;
    isWebhook: boolean;

    constructor(config: SyncRunConfig) {
        this.integrationService = config.integrationService;
        this.writeToDb = config.writeToDb;
        this.isAction = config.isAction || false;
        this.isWebhook = config.isWebhook || false;
        this.nangoConnection = config.nangoConnection;
        this.syncName = config.syncName;
        this.syncType = config.syncType;
        this.isInvokedImmediately = Boolean(config.isAction || config.isWebhook);

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

        if (config.input) {
            this.input = config.input;
        }

        if (config.provider) {
            this.provider = config.provider;
        }

        if (config.logMessages) {
            this.logMessages = config.logMessages;
        }

        if (config.stubbedMetadata) {
            this.stubbedMetadata = config.stubbedMetadata;
        }

        if (config.temporalContext) {
            this.temporalContext = config.temporalContext;
        }
    }

    async run(
        optionalLastSyncDate?: Date | null,
        bypassEnvironment?: boolean,
        optionalSecretKey?: string,
        optionalHost?: string
    ): Promise<ServiceResponse<boolean | object>> {
        if (this.debug) {
            const content = this.loadLocation ? `Looking for a local nango config at ${this.loadLocation}` : `Looking for a sync config for ${this.syncName}`;
            if (this.writeToDb) {
                await createActivityLogMessage({
                    level: 'debug',
                    environment_id: this.nangoConnection.environment_id,
                    activity_log_id: this.activityLogId as number,
                    timestamp: Date.now(),
                    content
                });
            } else {
                console.log(content);
            }
        }
        const nangoConfig = this.loadLocation
            ? await loadLocalNangoConfig(this.loadLocation)
            : await getSyncConfig(this.nangoConnection, this.syncName, this.isAction);

        if (!nangoConfig) {
            const message = `No sync configuration was found for ${this.syncName}.`;
            if (this.activityLogId) {
                await this.reportFailureForResults(message);
            } else {
                console.error(message);
            }

            const errorType = this.determineErrorType();
            return { success: false, error: new NangoError(errorType, message, 404), response: false };
        }

        const { integrations, models: configModels } = nangoConfig;
        let result = true;

        if (!integrations[this.nangoConnection.provider_config_key] && !this.writeToDb) {
            const message = `The connection you provided which applies to integration "${this.nangoConnection.provider_config_key}" does not match any integration in the ${nangoConfigFile}`;

            const errorType = this.determineErrorType();
            return { success: false, error: new NangoError(errorType, message, 404), response: false };
        }

        // if there is a matching customer integration code for the provider config key then run it
        if (integrations[this.nangoConnection.provider_config_key]) {
            let environment: Environment | null = null;

            if (!bypassEnvironment) {
                environment = await environmentService.getById(this.nangoConnection.environment_id as number);
            }

            if (!environment && !bypassEnvironment) {
                const message = `No environment was found for ${this.nangoConnection.environment_id}. The sync cannot continue without a valid environment`;
                await this.reportFailureForResults(message);
                const errorType = this.determineErrorType();
                return { success: false, error: new NangoError(errorType, message, 404), response: false };
            }

            const secretKey = optionalSecretKey || (environment ? (environment?.secret_key as string) : '');

            const providerConfigKey = this.nangoConnection.provider_config_key;
            const syncObject = integrations[providerConfigKey] as unknown as { [key: string]: NangoIntegration };

            let syncData: NangoIntegrationData;

            if (this.isAction) {
                syncData = (syncObject['actions'] ? syncObject!['actions']![this.syncName] : syncObject[this.syncName]) as unknown as NangoIntegrationData;
            } else {
                syncData = (syncObject['syncs'] ? syncObject!['syncs']![this.syncName] : syncObject[this.syncName]) as unknown as NangoIntegrationData;
            }

            const { returns: models, track_deletes: trackDeletes } = syncData;

            if (syncData.sync_config_id) {
                if (this.debug) {
                    const content = `Sync config id is ${syncData.sync_config_id}`;
                    if (this.writeToDb) {
                        await createActivityLogMessage({
                            level: 'debug',
                            environment_id: this.nangoConnection.environment_id,
                            activity_log_id: this.activityLogId as number,
                            timestamp: Date.now(),
                            content
                        });
                    } else {
                        console.log(content);
                    }
                }

                if (this.syncJobId) {
                    await addSyncConfigToJob(this.syncJobId as number, syncData.sync_config_id);
                }
            }

            if (!isCloud()) {
                const { path: integrationFilePath, result: integrationFileResult } = localFileService.checkForIntegrationDistFile(
                    this.syncName,
                    this.loadLocation
                );
                if (!integrationFileResult) {
                    const message = `Integration was attempted to run for ${this.syncName} but no integration file was found at ${integrationFilePath}.`;
                    await this.reportFailureForResults(message);

                    const errorType = this.determineErrorType();

                    return { success: false, error: new NangoError(errorType, message, 404), response: false };
                }
            }

            let lastSyncDate: Date | null | undefined = null;

            if (!this.isInvokedImmediately) {
                if (!this.writeToDb) {
                    lastSyncDate = optionalLastSyncDate;
                } else {
                    lastSyncDate = await getLastSyncDate(this.syncId as string);
                    await clearLastSyncDate(this.syncId as string);
                }
            }

            // TODO this only works for dryrun at the moment
            if (this.isAction && syncData.input) {
                const { input: configInput } = syncData;
                if (JAVASCRIPT_PRIMITIVES.includes(configInput as unknown as string)) {
                    if (typeof this.input !== (configInput as unknown as string)) {
                        const message = `The input provided of ${this.input} for ${this.syncName} is not of type ${configInput}`;
                        await this.reportFailureForResults(message);

                        return { success: false, error: new NangoError('action_script_failure', message, 500), response: false };
                    }
                } else {
                    if (configModels[configInput as unknown as string]) {
                        // TODO use joi or zod to validate the input dynamically
                    }
                }
            }

            const nangoProps = {
                host: optionalHost || getApiUrl(),
                accountId: environment?.account_id as number,
                connectionId: String(this.nangoConnection?.connection_id),
                environmentId: this.nangoConnection?.environment_id as number,
                providerConfigKey: String(this.nangoConnection?.provider_config_key),
                activityLogId: this.activityLogId as number,
                secretKey,
                nangoConnectionId: this.nangoConnection?.id as number,
                syncId: this.syncId,
                syncJobId: this.syncJobId,
                lastSyncDate: lastSyncDate as Date,
                dryRun: !this.writeToDb,
                attributes: syncData.attributes,
                track_deletes: trackDeletes as boolean,
                logMessages: this.logMessages,
                stubbedMetadata: this.stubbedMetadata
            };

            if (this.debug) {
                const content = `Last sync date is ${lastSyncDate}`;
                if (this.writeToDb) {
                    await createActivityLogMessage({
                        level: 'debug',
                        environment_id: this.nangoConnection.environment_id,
                        activity_log_id: this.activityLogId as number,
                        timestamp: Date.now(),
                        content
                    });
                } else {
                    console.log(content);
                }
            }

            try {
                result = true;

                const syncStartDate = new Date();

                const startTime = Date.now();
                const {
                    success,
                    error,
                    response: userDefinedResults
                } = await this.integrationService.runScript(
                    this.syncName,
                    (this.syncId as string) ||
                        `${this.syncName}-${this.nangoConnection.environment_id}-${this.nangoConnection.provider_config_key}-${this.nangoConnection.connection_id}`,
                    this.activityLogId as number,
                    nangoProps,
                    syncData,
                    this.nangoConnection.environment_id,
                    this.writeToDb,
                    this.isInvokedImmediately,
                    this.isWebhook,
                    this.loadLocation,
                    this.input,
                    this.temporalContext
                );

                if (!success || (error && userDefinedResults === null)) {
                    const message = `The integration was run but there was a problem in retrieving the results from the script "${this.syncName}"${
                        syncData?.version ? ` version: ${syncData.version}` : ''
                    }`;
                    await this.reportFailureForResults(message);

                    return { success: false, error, response: false };
                }

                if (!this.writeToDb) {
                    return userDefinedResults;
                }

                const endTime = Date.now();
                const totalRunTime = (endTime - startTime) / 1000;

                await metricsManager.captureMetric(MetricTypes.SYNC_TRACK_RUNTIME, this.syncId as string, this.syncType, totalRunTime, LogActionEnum.SYNC, [
                    `environmentId:${this.nangoConnection.environment_id}`,
                    `syncId:${this.syncId}`,
                    `syncName:${this.syncName}`,
                    `syncJobId:${this.syncJobId}`,
                    `syncVersion:${syncData.version}`,
                    `provider:${this.provider}`
                ]);

                if (this.isAction) {
                    const content = `${this.syncName} action was run successfully and results are being sent synchronously.`;

                    await updateSuccessActivityLog(this.activityLogId as number, true);

                    await createActivityLogMessageAndEnd({
                        level: 'info',
                        environment_id: this.nangoConnection.environment_id,
                        activity_log_id: this.activityLogId as number,
                        timestamp: Date.now(),
                        content
                    });

                    await slackNotificationService.removeFailingConnection(
                        this.nangoConnection,
                        this.syncName,
                        this.syncType,
                        this.activityLogId as number,
                        this.nangoConnection.environment_id,
                        this.provider as string
                    );

                    return { success: true, error: null, response: userDefinedResults };
                }

                // means a void response from the sync script which is expected
                // and means that they're using batchSave or batchDelete
                if (userDefinedResults === undefined) {
                    await this.finishSync(models, syncStartDate, syncData.version as string, totalRunTime, trackDeletes);

                    return { success: true, error: null, response: true };
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
                        } = formatDataRecords(
                            userDefinedResults[model],
                            this.nangoConnection.id as number,
                            model,
                            this.syncId,
                            this.syncJobId as number,
                            lastSyncDate as Date,
                            trackDeletes
                        );

                        if (!success || formattedResults === null) {
                            await this.reportFailureForResults(error?.message as string);

                            return { success: false, error, response: false };
                        }

                        if (this.writeToDb && this.activityLogId) {
                            if (formattedResults.length === 0) {
                                await this.reportResults(
                                    model,
                                    { addedKeys: [], updatedKeys: [], deletedKeys: [], affectedInternalIds: [], affectedExternalIds: [] },
                                    i,
                                    models.length,
                                    syncStartDate,
                                    syncData.version as string,
                                    totalRunTime,
                                    trackDeletes
                                );
                            }

                            if (formattedResults.length > 0) {
                                await metricsManager.capture(
                                    MetricTypes.SYNC_SCRIPT_RETURN_USED,
                                    'Data was sent at the end of the integration script instead of using batchSave',
                                    LogActionEnum.SYNC,
                                    {
                                        environmentId: String(this.nangoConnection.environment_id),
                                        syncName: this.syncName,
                                        connectionDetails: JSON.stringify(this.nangoConnection),
                                        syncId: this.syncId,
                                        syncJobId: String(this.syncJobId),
                                        syncType: this.syncType,
                                        debug: String(this.debug)
                                    }
                                );

                                const upsertResult: UpsertResponse = await upsert(
                                    formattedResults,
                                    '_nango_sync_data_records',
                                    'external_id',
                                    this.nangoConnection.id as number,
                                    model,
                                    this.activityLogId,
                                    this.nangoConnection.environment_id
                                );

                                if (upsertResult.success) {
                                    const { summary } = upsertResult;

                                    await this.reportResults(
                                        model,
                                        summary as UpsertSummary,
                                        i,
                                        models.length,
                                        syncStartDate,
                                        syncData.version as string,
                                        totalRunTime
                                    );
                                }

                                if (!upsertResult.success) {
                                    const message = `There was a problem upserting the data for ${this.syncName} and the model ${model} with the error message: ${upsertResult?.error}`;
                                    await this.reportFailureForResults(message);

                                    const errorType = this.determineErrorType();

                                    return { success: false, error: new NangoError(errorType, message), response: result };
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

                const errorType = this.determineErrorType();

                return { success: false, error: new NangoError(errorType, errorMessage), response: result };
            }
        }

        return { success: true, error: null, response: result };
    }

    async finishSync(models: string[], syncStartDate: Date, version: string, totalRunTime: number, trackDeletes?: boolean): Promise<void> {
        let i = 0;
        for (const model of models) {
            if (!this.isWebhook && trackDeletes) {
                await clearOldRecords(this.nangoConnection?.id as number, model);
            }
            const deletedKeys = trackDeletes ? await getDeletedKeys('_nango_sync_data_records', 'external_id', this.nangoConnection.id as number, model) : [];

            if (!this.isWebhook && trackDeletes) {
                await syncUpdateAtForDeletedRecords(this.nangoConnection.id as number, model, 'external_id', deletedKeys);
            }

            await this.reportResults(
                model,
                { addedKeys: [], updatedKeys: [], deletedKeys, affectedInternalIds: [], affectedExternalIds: [] },
                i,
                models.length,
                syncStartDate,
                version,
                totalRunTime,
                trackDeletes
            );
            i++;
        }
    }

    async reportResults(
        model: string,
        responseResults: UpsertSummary,
        index: number,
        numberOfModels: number,
        syncStartDate: Date,
        version: string,
        totalRunTime: number,
        trackDeletes?: boolean
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
            if (!this.isWebhook) {
                const override = false;
                await setLastSyncDate(this.syncId as string, syncStartDate, override);
                await slackNotificationService.removeFailingConnection(
                    this.nangoConnection,
                    this.syncName,
                    this.syncType,
                    this.activityLogId as number,
                    this.nangoConnection.environment_id,
                    this.provider as string
                );
            }
        }

        if (!this.isWebhook && trackDeletes) {
            await takeSnapshot(this.nangoConnection?.id as number, model);
        }

        const updatedResults: Record<string, SyncResult> = {
            [model]: {
                added: responseResults.addedKeys.length,
                updated: responseResults.updatedKeys.length,
                deleted: responseResults.deletedKeys?.length as number
            }
        };

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
            updated,
            deleted
        };

        await webhookService.send(
            this.nangoConnection,
            this.syncName,
            model,
            results,
            this.syncType,
            syncStartDate,
            this.activityLogId,
            this.nangoConnection.environment_id
        );

        if (index === numberOfModels - 1) {
            await createActivityLogMessageAndEnd({
                level: 'info',
                environment_id: this.nangoConnection.environment_id,
                activity_log_id: this.activityLogId,
                timestamp: Date.now(),
                content
            });
        } else {
            await createActivityLogMessage({
                level: 'info',
                environment_id: this.nangoConnection.environment_id,
                activity_log_id: this.activityLogId,
                timestamp: Date.now(),
                content
            });
        }

        await metricsManager.capture(
            MetricTypes.SYNC_SUCCESS,
            content,
            LogActionEnum.SYNC,
            {
                model,
                environmentId: String(this.nangoConnection.environment_id),
                responseResults: JSON.stringify(responseResults),
                numberOfModels: String(numberOfModels),
                version,
                syncName: this.syncName,
                connectionDetails: JSON.stringify(this.nangoConnection),
                syncId: this.syncId as string,
                syncJobId: String(this.syncJobId),
                syncType: this.syncType,
                totalRunTime: `${totalRunTime} seconds`,
                debug: String(this.debug)
            },
            `syncId:${this.syncId}`
        );
    }

    async reportFailureForResults(content: string) {
        if (!this.writeToDb) {
            return;
        }

        if (!this.isWebhook) {
            await slackNotificationService.reportFailure(
                this.nangoConnection,
                this.syncName,
                this.syncType,
                this.activityLogId as number,
                this.nangoConnection.environment_id,
                this.provider as string
            );
        }

        if (!this.activityLogId || !this.syncJobId) {
            console.error(content);
            return;
        }

        await updateSuccessActivityLog(this.activityLogId, false);
        await updateSyncJobStatus(this.syncJobId, SyncStatus.STOPPED);

        await createActivityLogMessageAndEnd({
            level: 'error',
            environment_id: this.nangoConnection.environment_id,
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

        await metricsManager.capture(
            MetricTypes.SYNC_FAILURE,
            content,
            LogActionEnum.SYNC,
            {
                environmentId: String(this.nangoConnection.environment_id),
                syncName: this.syncName,
                connectionDetails: JSON.stringify(this.nangoConnection),
                syncId: this.syncId as string,
                syncJobId: String(this.syncJobId),
                syncType: this.syncType,
                debug: String(this.debug)
            },
            `syncId:${this.syncId}`
        );
    }

    private determineErrorType(): string {
        if (this.isAction) {
            return 'action_script_failure';
        } else if (this.isWebhook) {
            return 'webhook_script_failure';
        } else {
            return 'sync_script_failure';
        }
    }
}
