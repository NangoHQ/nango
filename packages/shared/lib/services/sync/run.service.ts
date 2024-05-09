import type { Context } from '@temporalio/activity';
import { loadLocalNangoConfig, nangoConfigFile } from '../nango-config.service.js';
import type { NangoConnection, Metadata } from '../../models/Connection.js';
import type { SyncResult, SyncType, Job as SyncJob, IntegrationServiceInterface } from '../../models/Sync.js';
import { SyncStatus } from '../../models/Sync.js';
import type { ServiceResponse } from '../../models/Generic.js';
import { createActivityLogMessage, createActivityLogMessageAndEnd, updateSuccess as updateSuccessActivityLog } from '../activity/activity.service.js';
import { addSyncConfigToJob, updateSyncJobResult, updateSyncJobStatus } from '../sync/job.service.js';
import { getSyncConfig } from './config/config.service.js';
import localFileService from '../file/local.service.js';
import { getLastSyncDate, setLastSyncDate } from './sync.service.js';
import environmentService from '../environment.service.js';
import accountService from '../account.service.js';
import slackNotificationService from '../notification/slack.service.js';
import webhookService from '../notification/webhook.service.js';
import { integrationFilesAreRemote, isCloud, getLogger, metrics, stringifyError } from '@nangohq/utils';
import { getApiUrl, isJsOrTsType } from '../../utils/utils.js';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';
import { NangoError } from '../../utils/error.js';
import telemetry, { LogTypes } from '../../utils/telemetry.js';
import type { NangoIntegrationData, NangoIntegration } from '../../models/NangoConfig.js';
import { LogActionEnum } from '../../models/Activity.js';
import type { Environment } from '../../models/Environment.js';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import type { NangoProps } from '../../sdk/sync.js';
import type { UpsertSummary } from '@nangohq/records';

const logger = getLogger('run.service');

interface BigQueryClientInterface {
    insert(row: RunScriptRow): Promise<void>;
}

interface RunScriptRow {
    executionType: string;
    internalConnectionId: number | undefined;
    connectionId: string;
    accountId: number | undefined;
    accountName: string;
    scriptName: string;
    scriptType: string;
    environmentId: number;
    environmentName: string;
    providerConfigKey: string;
    status: string;
    syncId: string;
    content: string;
    runTimeInSeconds: number;
    createdAt: number;
}

export interface SyncRunConfig {
    bigQueryClient?: BigQueryClientInterface;
    integrationService: IntegrationServiceInterface;
    recordsService: RecordsServiceInterface;
    dryRunService?: NangoProps['dryRunService'];
    logContextGetter: LogContextGetter;

    writeToDb: boolean;
    isAction?: boolean;
    isInvokedImmediately?: boolean;
    isWebhook?: boolean;
    nangoConnection: NangoConnection;
    syncName: string;
    syncType: SyncType;

    syncId?: string;
    syncJobId?: number;
    activityLogId?: number | undefined;
    provider?: string;

    loadLocation?: string;
    debug?: boolean;
    input?: object;

    logMessages?: { counts: { updated: number; added: number; deleted: number }; messages: unknown[] } | undefined;
    stubbedMetadata?: Metadata | undefined;

    accountName?: string;
    environmentName?: string;

    temporalContext?: Context;
}

export interface RecordsServiceInterface {
    markNonCurrentGenerationRecordsAsDeleted({
        connectionId,
        model,
        syncId,
        generation
    }: {
        connectionId: number;
        model: string;
        syncId: string;
        generation: number;
    }): Promise<string[]>;
}

export default class SyncRun {
    bigQueryClient?: BigQueryClientInterface;
    integrationService: IntegrationServiceInterface;
    recordsService: RecordsServiceInterface;
    dryRunService?: NangoProps['dryRunService'];
    logContextGetter: LogContextGetter;

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

    logMessages?: { counts: { updated: number; added: number; deleted: number }; messages: unknown[] } | undefined = {
        counts: { updated: 0, added: 0, deleted: 0 },
        messages: []
    };
    stubbedMetadata?: Metadata | undefined = undefined;

    accountName?: string;
    environmentName?: string;

    temporalContext?: Context;
    isWebhook: boolean;

    logCtx?: LogContext;

    constructor(config: SyncRunConfig) {
        this.integrationService = config.integrationService;
        this.recordsService = config.recordsService;
        this.logContextGetter = config.logContextGetter;
        if (config.bigQueryClient) {
            this.bigQueryClient = config.bigQueryClient;
        }
        if (config.dryRunService) {
            this.dryRunService = config.dryRunService;
        }
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
            this.logCtx = this.logContextGetter.get({ id: String(config.activityLogId) });
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

    async cancel(): Promise<ServiceResponse<boolean>> {
        await this.integrationService.cancelScript(this.syncId as string, this.nangoConnection.environment_id);

        return { success: false, error: null, response: false };
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
                await this.logCtx?.debug(content);
            } else {
                logger.info(content);
            }
        }
        const nangoConfig = this.loadLocation
            ? await loadLocalNangoConfig(this.loadLocation)
            : await getSyncConfig(this.nangoConnection, this.syncName, this.isAction);

        if (!nangoConfig) {
            const message = `No ${this.isAction ? 'action' : 'sync'} configuration was found for ${this.syncName}.`;
            if (this.activityLogId) {
                await this.reportFailureForResults({ content: message, runTime: 0 });
            } else {
                logger.error(message);
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
                environment = await environmentService.getById(this.nangoConnection.environment_id);
            }

            if (!this.nangoConnection.account_id && environment?.account_id !== null && environment?.account_id !== undefined) {
                this.nangoConnection.account_id = environment.account_id;
            }

            if (!bypassEnvironment) {
                const account = await accountService.getAccountById(this.nangoConnection.account_id as number);
                this.accountName = account?.name || '';
                this.environmentName = (await environmentService.getEnvironmentName(this.nangoConnection.environment_id)) || '';
            }

            if (!environment && !bypassEnvironment) {
                const message = `No environment was found for ${this.nangoConnection.environment_id}. The sync cannot continue without a valid environment`;
                await this.reportFailureForResults({ content: message, runTime: 0 });
                const errorType = this.determineErrorType();
                return { success: false, error: new NangoError(errorType, message, 404), response: false };
            }

            const secretKey = optionalSecretKey || (environment ? environment.secret_key : '');

            const providerConfigKey = this.nangoConnection.provider_config_key;
            const syncObject = integrations[providerConfigKey] as unknown as Record<string, NangoIntegration>;

            let syncData: NangoIntegrationData;

            if (this.isAction) {
                syncData = (syncObject['actions'] ? syncObject['actions'][this.syncName] : syncObject[this.syncName]) as unknown as NangoIntegrationData;
            } else {
                syncData = (syncObject['syncs'] ? syncObject['syncs'][this.syncName] : syncObject[this.syncName]) as unknown as NangoIntegrationData;
            }

            const { returns: models, track_deletes: trackDeletes, is_public: isPublic } = syncData;

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
                        await this.logCtx?.debug(content);
                    } else {
                        logger.info(content);
                    }
                }

                if (this.syncJobId) {
                    await addSyncConfigToJob(this.syncJobId, syncData.sync_config_id);
                }
            }

            if (!isCloud && !integrationFilesAreRemote && !isPublic) {
                const { path: integrationFilePath, result: integrationFileResult } = localFileService.checkForIntegrationDistFile(
                    this.syncName,
                    providerConfigKey,
                    this.loadLocation
                );
                if (!integrationFileResult) {
                    const message = `Integration was attempted to run for ${this.syncName} but no integration file was found at ${integrationFilePath}.`;
                    await this.reportFailureForResults({ content: message, runTime: 0 });

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
                }
            }

            // TODO this only works for dryrun at the moment
            if (this.isAction && syncData.input) {
                const { input: configInput } = syncData;
                if (isJsOrTsType(configInput as unknown as string)) {
                    if (typeof this.input !== (configInput as unknown as string)) {
                        const message = `The input provided of ${this.input} for ${this.syncName} is not of type ${configInput}`;
                        await this.reportFailureForResults({ content: message, runTime: 0 });

                        return { success: false, error: new NangoError('action_script_failure', message, 500), response: false };
                    }
                } else {
                    if (configModels[configInput as unknown as string]) {
                        // TODO use joi or zod to validate the input dynamically
                    }
                }
            }

            const nangoProps: NangoProps = {
                host: optionalHost || getApiUrl(),
                accountId: environment?.account_id as number,
                connectionId: String(this.nangoConnection.connection_id),
                environmentId: this.nangoConnection.environment_id,
                providerConfigKey: String(this.nangoConnection.provider_config_key),
                provider: this.provider as string,
                activityLogId: this.activityLogId as number,
                secretKey,
                nangoConnectionId: this.nangoConnection.id as number,
                syncId: this.syncId,
                syncJobId: this.syncJobId,
                lastSyncDate: lastSyncDate as Date,
                dryRun: !this.writeToDb,
                attributes: syncData.attributes,
                track_deletes: trackDeletes as boolean,
                logMessages: this.logMessages,
                stubbedMetadata: this.stubbedMetadata
            };

            if (this.dryRunService) {
                nangoProps.dryRunService = this.dryRunService;
            }

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
                    await this.logCtx?.debug(content);
                } else {
                    logger.info(content);
                }
            }

            const startTime = Date.now();
            try {
                result = true;

                const syncStartDate = new Date();

                const {
                    success,
                    error,
                    response: userDefinedResults
                } = await this.integrationService.runScript({
                    syncName: this.syncName,
                    syncId:
                        (this.syncId as string) ||
                        `${this.syncName}-${this.nangoConnection.environment_id}-${this.nangoConnection.provider_config_key}-${this.nangoConnection.connection_id}`,
                    activityLogId: this.activityLogId as number,
                    nangoProps,
                    integrationData: syncData,
                    environmentId: this.nangoConnection.environment_id,
                    writeToDb: this.writeToDb,
                    isInvokedImmediately: this.isInvokedImmediately,
                    isWebhook: this.isWebhook,
                    optionalLoadLocation: this.loadLocation,
                    input: this.input,
                    temporalContext: this.temporalContext
                });

                if (!success || (error && userDefinedResults === null)) {
                    const message = `The integration was run but there was a problem in retrieving the results from the script "${this.syncName}"${
                        syncData.version ? ` version: ${syncData.version}` : ''
                    }`;

                    const runTime = (Date.now() - startTime) / 1000;
                    if (error.type === 'script_cancelled') {
                        await this.reportFailureForResults({ content: error.message, runTime, isCancel: true });
                    } else {
                        await this.reportFailureForResults({ content: message, runTime });
                    }

                    return { success: false, error, response: false };
                }

                if (!this.writeToDb) {
                    return userDefinedResults;
                }

                const totalRunTime = (Date.now() - startTime) / 1000;

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
                    await this.logCtx?.info(content);
                    await this.logCtx?.success();

                    await slackNotificationService.removeFailingConnection(
                        this.nangoConnection,
                        this.syncName,
                        this.syncType,
                        this.activityLogId as number,
                        this.nangoConnection.environment_id,
                        this.provider as string,
                        this.logContextGetter
                    );

                    await this.finishFlow(models, syncStartDate, syncData.version as string, totalRunTime, trackDeletes);

                    return { success: true, error: null, response: userDefinedResults };
                }

                await this.finishFlow(models, syncStartDate, syncData.version as string, totalRunTime, trackDeletes);

                return { success: true, error: null, response: true };
            } catch (e) {
                result = false;
                const errorMessage = stringifyError(e, { pretty: true });
                await this.reportFailureForResults({
                    content: `The ${this.syncType} "${this.syncName}"${
                        syncData.version ? ` version: ${syncData.version}` : ''
                    } sync did not complete successfully and has the following error: ${errorMessage}`,
                    runTime: (Date.now() - startTime) / 1000
                });

                const errorType = this.determineErrorType();

                return { success: false, error: new NangoError(errorType, errorMessage), response: result };
            } finally {
                if (!this.isInvokedImmediately) {
                    const totalRunTime = (Date.now() - startTime) / 1000;
                    metrics.duration(metrics.Types.SYNC_TRACK_RUNTIME, totalRunTime);
                }
            }
        }

        return { success: true, error: null, response: result };
    }

    async finishFlow(models: string[], syncStartDate: Date, version: string, totalRunTime: number, trackDeletes?: boolean): Promise<void> {
        let i = 0;
        for (const model of models) {
            let deletedKeys: string[] = [];
            if (!this.isWebhook && trackDeletes) {
                deletedKeys = await this.recordsService.markNonCurrentGenerationRecordsAsDeleted({
                    connectionId: this.nangoConnection.id as number,
                    model,
                    syncId: this.syncId as string,
                    generation: this.syncJobId as number
                });
            }

            await this.reportResults(
                model,
                { addedKeys: [], updatedKeys: [], deletedKeys, nonUniqueKeys: [] },
                i,
                models.length,
                syncStartDate,
                version,
                totalRunTime
            );
            i++;
        }

        // we only want to report to bigquery once if it is a multi model sync
        if (this.bigQueryClient) {
            void this.bigQueryClient.insert({
                executionType: this.determineExecutionType(),
                connectionId: this.nangoConnection.connection_id,
                internalConnectionId: this.nangoConnection.id,
                accountId: this.nangoConnection.account_id,
                accountName: this.accountName as string,
                scriptName: this.syncName,
                scriptType: this.syncType,
                environmentId: this.nangoConnection.environment_id,
                environmentName: this.environmentName as string,
                providerConfigKey: this.nangoConnection.provider_config_key,
                status: 'success',
                syncId: this.syncId as string,
                content: `The ${this.syncType} "${this.syncName}" ${this.determineExecutionType()} has been completed successfully.`,
                runTimeInSeconds: totalRunTime,
                createdAt: Date.now()
            });
        }
    }

    async reportResults(
        model: string,
        responseResults: UpsertSummary,
        index: number,
        numberOfModels: number,
        syncStartDate: Date,
        version: string,
        totalRunTime: number
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
            if (!this.isWebhook) {
                await setLastSyncDate(this.syncId as string, syncStartDate);
                await slackNotificationService.removeFailingConnection(
                    this.nangoConnection,
                    this.syncName,
                    this.syncType,
                    this.activityLogId,
                    this.nangoConnection.environment_id,
                    this.provider as string,
                    this.logContextGetter
                );
            }
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
            await this.reportFailureForResults({
                content: `The sync job ${this.syncJobId} could not be updated with the results for the model ${model}.`,
                runTime: totalRunTime
            });
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
            deleted = modelResult.deleted;
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

        await webhookService.sendSyncUpdate(
            this.nangoConnection,
            this.syncName,
            model,
            results,
            this.syncType,
            syncStartDate,
            this.activityLogId,
            this.logCtx!,
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
            await this.logCtx?.info(content);
            await this.logCtx?.success();
        } else {
            await createActivityLogMessage({
                level: 'info',
                environment_id: this.nangoConnection.environment_id,
                activity_log_id: this.activityLogId,
                timestamp: Date.now(),
                content
            });
            await this.logCtx?.info(content);
        }

        await telemetry.log(
            LogTypes.SYNC_SUCCESS,
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
                connectionId: this.nangoConnection.connection_id,
                providerConfigKey: this.nangoConnection.provider_config_key,
                syncId: this.syncId as string,
                syncJobId: String(this.syncJobId),
                syncType: this.syncType,
                totalRunTime: `${totalRunTime} seconds`,
                debug: String(this.debug)
            },
            `syncId:${this.syncId}`
        );
    }

    async reportFailureForResults({ content, runTime, isCancel }: { content: string; runTime: number; isCancel?: true }) {
        if (!this.writeToDb) {
            return;
        }

        if (this.bigQueryClient) {
            void this.bigQueryClient.insert({
                executionType: this.determineExecutionType(),
                connectionId: this.nangoConnection.connection_id,
                internalConnectionId: this.nangoConnection.id,
                accountId: this.nangoConnection.account_id,
                accountName: this.accountName as string,
                scriptName: this.syncName,
                scriptType: this.syncType,
                environmentId: this.nangoConnection.environment_id,
                environmentName: this.environmentName as string,
                providerConfigKey: this.nangoConnection.provider_config_key,
                status: 'failed',
                syncId: this.syncId as string,
                content,
                runTimeInSeconds: runTime,
                createdAt: Date.now()
            });
        }

        if (!this.isWebhook) {
            try {
                await slackNotificationService.reportFailure(
                    this.nangoConnection,
                    this.syncName,
                    this.syncType,
                    this.activityLogId as number,
                    this.nangoConnection.environment_id,
                    this.provider as string,
                    this.logContextGetter
                );
            } catch {
                errorManager.report('slack notification service reported a failure', {
                    environmentId: this.nangoConnection.environment_id,
                    source: ErrorSourceEnum.PLATFORM,
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
            }
        }

        if (!this.activityLogId || !this.syncJobId) {
            logger.error(content);
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
        await this.logCtx?.error(content);
        if (isCancel) {
            await this.logCtx?.cancel();
        } else {
            await this.logCtx?.failed();
        }

        errorManager.report(content, {
            environmentId: this.nangoConnection.environment_id,
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

        await telemetry.log(
            LogTypes.SYNC_FAILURE,
            content,
            LogActionEnum.SYNC,
            {
                environmentId: String(this.nangoConnection.environment_id),
                syncName: this.syncName,
                connectionDetails: JSON.stringify(this.nangoConnection),
                connectionId: this.nangoConnection.connection_id,
                providerConfigKey: this.nangoConnection.provider_config_key,
                syncId: this.syncId as string,
                syncJobId: String(this.syncJobId),
                syncType: this.syncType,
                debug: String(this.debug),
                level: 'error'
            },
            `syncId:${this.syncId}`
        );
    }

    private determineExecutionType(): string {
        if (this.isAction) {
            return 'action';
        } else if (this.isWebhook) {
            return 'webhook';
        } else {
            return 'sync';
        }
    }

    private determineErrorType(): string {
        return this.determineExecutionType() + '_script_failure';
    }
}
