import type { Context } from '@temporalio/activity';
import { loadLocalNangoConfig, nangoConfigFile } from '../nango-config.service.js';
import type { NangoConnection } from '../../models/Connection.js';
import type { Account } from '../../models/Admin.js';
import type { Metadata, ErrorPayload } from '@nangohq/types';
import type { SyncResult, SyncType, Job as SyncJob, IntegrationServiceInterface } from '../../models/Sync.js';
import { SyncStatus } from '../../models/Sync.js';
import type { ServiceResponse } from '../../models/Generic.js';
import { createActivityLogMessage, createActivityLogMessageAndEnd, updateSuccess as updateSuccessActivityLog } from '../activity/activity.service.js';
import { addSyncConfigToJob, updateSyncJobResult, updateSyncJobStatus } from '../sync/job.service.js';
import { errorNotificationService } from '../notification/error.service.js';
import { getSyncConfig } from './config/config.service.js';
import localFileService from '../file/local.service.js';
import { getLastSyncDate, setLastSyncDate } from './sync.service.js';
import environmentService from '../environment.service.js';
import type { SlackService } from '../notification/slack.service.js';
import { integrationFilesAreRemote, isCloud, getLogger, metrics, stringifyError } from '@nangohq/utils';
import { getApiUrl } from '../../utils/utils.js';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';
import { NangoError } from '../../utils/error.js';
import telemetry, { LogTypes } from '../../utils/telemetry.js';
import type { NangoIntegrationData, NangoIntegration } from '../../models/NangoConfig.js';
import { LogActionEnum } from '../../models/Activity.js';
import type { Environment } from '../../models/Environment.js';
import type { LogContext } from '@nangohq/logs';
import type { NangoProps } from '../../sdk/sync.js';
import type { UpsertSummary } from '@nangohq/records';
import type { SendSyncParams } from '@nangohq/webhooks';
import { isJsOrTsType } from '@nangohq/nango-yaml';

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

export type SyncRunConfig = {
    bigQueryClient?: BigQueryClientInterface;
    integrationService: IntegrationServiceInterface;
    recordsService: RecordsServiceInterface;
    dryRunService?: NangoProps['dryRunService'];

    isAction?: boolean;
    isInvokedImmediately?: boolean;
    isWebhook?: boolean;
    isPostConnectionScript?: boolean;
    nangoConnection: NangoConnection;
    syncName: string;
    syncType: SyncType;

    syncId?: string;
    syncJobId?: number;
    provider?: string;

    loadLocation?: string;
    fileLocation?: string;
    debug?: boolean;
    input?: object;

    logMessages?: { counts: { updated: number; added: number; deleted: number }; messages: unknown[] } | undefined;
    stubbedMetadata?: Metadata | undefined;

    account?: Account;
    environment?: Environment;

    temporalContext?: Context;
} & (
    | { writeToDb: true; activityLogId: number; logCtx: LogContext; slackService: SlackService; sendSyncWebhook: (params: SendSyncParams) => Promise<void> }
    | { writeToDb: false }
);

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
    slackNotificationService?: SlackService;
    sendSyncWebhook?: (params: SendSyncParams) => Promise<void>;

    writeToDb: boolean;
    isAction: boolean;
    isPostConnectionScript: boolean;
    isInvokedImmediately: boolean;
    nangoConnection: NangoConnection;
    syncName: string;
    syncType: SyncType;

    syncId?: string;
    syncJobId?: number;
    activityLogId?: number;
    provider?: string;
    loadLocation?: string;
    fileLocation?: string;
    debug?: boolean;
    input?: object;

    logMessages?: { counts: { updated: number; added: number; deleted: number }; messages: unknown[] } | undefined = {
        counts: { updated: 0, added: 0, deleted: 0 },
        messages: []
    };
    stubbedMetadata?: Metadata | undefined = undefined;

    account?: Account;
    environment?: Environment;

    temporalContext?: Context;
    isWebhook: boolean;

    logCtx?: LogContext;

    constructor(config: SyncRunConfig) {
        this.integrationService = config.integrationService;
        this.recordsService = config.recordsService;
        if (config.bigQueryClient) {
            this.bigQueryClient = config.bigQueryClient;
        }
        if (config.dryRunService) {
            this.dryRunService = config.dryRunService;
        }
        this.isAction = config.isAction || false;
        this.isWebhook = config.isWebhook || false;
        this.isPostConnectionScript = config.isPostConnectionScript || false;
        this.nangoConnection = config.nangoConnection;
        this.syncName = config.syncName;
        this.syncType = config.syncType;
        this.isInvokedImmediately = Boolean(config.isAction || config.isWebhook || config.isPostConnectionScript);

        if (config.syncId) {
            this.syncId = config.syncId;
        }

        if (config.syncJobId) {
            this.syncJobId = config.syncJobId;
        }

        this.writeToDb = config.writeToDb;
        if (config.writeToDb) {
            this.slackNotificationService = config.slackService;
            this.activityLogId = config.activityLogId;
            this.logCtx = config.logCtx;
            this.sendSyncWebhook = config.sendSyncWebhook;
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

        if (config.fileLocation) {
            this.fileLocation = config.fileLocation;
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
                await this.logCtx?.debug(content);
            } else {
                logger.info(content);
            }
        }
        let nangoConfig = this.loadLocation
            ? await loadLocalNangoConfig(this.loadLocation)
            : await getSyncConfig(this.nangoConnection, this.syncName, this.isAction);

        if (!nangoConfig && this.isPostConnectionScript) {
            nangoConfig = {
                integrations: {
                    [this.nangoConnection.provider_config_key]: {
                        'post-connection-scripts': [this.syncName]
                    }
                },
                models: {}
            };
        }

        if (!nangoConfig) {
            const message = `No ${this.isAction ? 'action' : 'sync'} configuration was found for ${this.syncName}.`;
            if (this.activityLogId) {
                await this.reportFailureForResults({
                    content: message,
                    runTime: 0,
                    models: ['n/a'],
                    syncStartDate: new Date(),
                    error: {
                        type: 'no_sync_config',
                        description: message
                    }
                });
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
        if (integrations[this.nangoConnection.provider_config_key] || this.isPostConnectionScript) {
            let environment: Environment | null = null;
            let account: Account | null = null;

            if (!bypassEnvironment) {
                const environmentAndAccountLookup = await environmentService.getAccountAndEnvironment({ environmentId: this.nangoConnection.environment_id });
                if (!environmentAndAccountLookup) {
                    const message = `No environment was found for ${this.nangoConnection.environment_id}. The sync cannot continue without a valid environment`;
                    await this.reportFailureForResults({
                        content: message,
                        runTime: 0,
                        models: ['n/a'],
                        syncStartDate: new Date(),
                        error: {
                            type: 'no_environment',
                            description: message
                        }
                    });
                    const errorType = this.determineErrorType();
                    return { success: false, error: new NangoError(errorType, message, 404), response: false };
                }
                ({ environment, account } = environmentAndAccountLookup);
                this.account = account;
                this.environment = environment;
            }

            if (!this.nangoConnection.account_id && environment?.account_id !== null && environment?.account_id !== undefined) {
                this.nangoConnection.account_id = environment.account_id;
            }

            let secretKey = optionalSecretKey || (environment ? environment.secret_key : '');

            if (!isCloud) {
                if (process.env['NANGO_SECRET_KEY_DEV'] && environment?.name === 'dev') {
                    secretKey = process.env['NANGO_SECRET_KEY_DEV'];
                }

                if (process.env['NANGO_SECRET_KEY_PROD'] && environment?.name === 'prod') {
                    secretKey = process.env['NANGO_SECRET_KEY_PROD'];
                }
            }

            const providerConfigKey = this.nangoConnection.provider_config_key;
            const syncObject = integrations[providerConfigKey] as unknown as Record<string, NangoIntegration>;

            let syncData: NangoIntegrationData;

            if (this.isAction) {
                syncData = (syncObject['actions'] ? syncObject['actions'][this.syncName] : syncObject[this.syncName]) as unknown as NangoIntegrationData;
            } else if (this.isPostConnectionScript) {
                syncData = {
                    runs: 'every 5 minutes',
                    returns: [],
                    track_deletes: false,
                    is_public: false,
                    fileLocation: this.fileLocation
                } as NangoIntegrationData;
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
                    await this.reportFailureForResults({
                        content: message,
                        runTime: 0,
                        models,
                        syncStartDate: new Date(),
                        error: {
                            type: 'no_integration_file',
                            description: message
                        }
                    });

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
                        await this.reportFailureForResults({
                            content: message,
                            runTime: 0,
                            models,
                            syncStartDate: new Date(),
                            error: {
                                type: 'input_type_mismatch',
                                description: message
                            }
                        });

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
                accountId: this.account?.id as number,
                connectionId: String(this.nangoConnection.connection_id),
                environmentId: this.nangoConnection.environment_id,
                environmentName: this.environment?.name as string,
                providerConfigKey: String(this.nangoConnection.provider_config_key),
                provider: this.provider as string,
                activityLogId: this.activityLogId,
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
            const syncStartDate = new Date();
            try {
                result = true;

                if (typeof nangoProps.accountId === 'number') {
                    metrics.increment(getMetricType(this.determineExecutionType()), 1, { accountId: nangoProps.accountId });
                }

                const {
                    success,
                    error,
                    response: userDefinedResults
                } = await this.integrationService.runScript({
                    syncName: this.syncName,
                    syncId:
                        (this.syncId as string) ||
                        `${this.syncName}-${this.nangoConnection.environment_id}-${this.nangoConnection.provider_config_key}-${this.nangoConnection.connection_id}`,
                    activityLogId: this.activityLogId,
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
                        await this.reportFailureForResults({
                            content: error.message,
                            runTime,
                            isCancel: true,
                            models,
                            syncStartDate,
                            error: {
                                type: 'script_cancelled',
                                description: error.message
                            }
                        });
                    } else {
                        await this.reportFailureForResults({
                            content: message,
                            runTime,
                            models,
                            syncStartDate,
                            error: {
                                type: 'script_error',
                                description: message
                            }
                        });
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

                    await this.slackNotificationService?.removeFailingConnection(
                        this.nangoConnection,
                        this.syncName,
                        this.syncType,
                        this.activityLogId as number,
                        this.nangoConnection.environment_id,
                        this.provider as string
                    );

                    await this.finishFlow(models, syncStartDate, syncData.version as string, totalRunTime, trackDeletes);

                    return { success: true, error: null, response: userDefinedResults };
                }

                if (this.isPostConnectionScript) {
                    const content = `The post connection script "${this.syncName}" has been run successfully.`;

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
                    runTime: (Date.now() - startTime) / 1000,
                    models,
                    syncStartDate,
                    error: {
                        type: 'script_error',
                        description: errorMessage
                    }
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

        if (!this.isAction && !this.isWebhook && !this.isPostConnectionScript) {
            for (const model of models) {
                let deletedKeys: string[] = [];
                if (trackDeletes) {
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
            await this.logCtx?.success();
        }

        // we only want to report to bigquery once if it is a multi model sync
        if (this.bigQueryClient && this.account && this.environment) {
            void this.bigQueryClient.insert({
                executionType: this.determineExecutionType(),
                connectionId: this.nangoConnection.connection_id,
                internalConnectionId: this.nangoConnection.id,
                accountId: this.account.id,
                accountName: this.account.name,
                scriptName: this.syncName,
                scriptType: this.syncType,
                environmentId: this.nangoConnection.environment_id,
                environmentName: this.environment.name,
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
            if (!this.isWebhook && !this.isPostConnectionScript) {
                await setLastSyncDate(this.syncId as string, syncStartDate);
                await this.slackNotificationService?.removeFailingConnection(
                    this.nangoConnection,
                    this.syncName,
                    this.determineExecutionType(),
                    this.activityLogId,
                    this.nangoConnection.environment_id,
                    this.provider as string
                );
            }

            if (this.syncId && this.nangoConnection.id) {
                await errorNotificationService.sync.clear({
                    sync_id: this.syncId,
                    connection_id: this.nangoConnection.id
                });
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
                runTime: totalRunTime,
                models: [model],
                syncStartDate,
                error: {
                    type: 'sync_job_update_failure',
                    description: `The sync job ${this.syncJobId} could not be updated with the results for the model ${model}.`
                }
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

        if (this.environment && this.sendSyncWebhook) {
            void this.sendSyncWebhook({
                connection: this.nangoConnection,
                environment: this.environment,
                syncName: this.syncName,
                model,
                now: syncStartDate,
                responseResults: results,
                syncType: this.syncType === 'INITIAL' ? 'INITIAL' : 'INCREMENTAL',
                activityLogId: this.activityLogId,
                logCtx: this.logCtx
            });
        }

        if (index === numberOfModels - 1) {
            await createActivityLogMessageAndEnd({
                level: 'info',
                environment_id: this.nangoConnection.environment_id,
                activity_log_id: this.activityLogId,
                timestamp: Date.now(),
                content
            });
            await this.logCtx?.info(content);
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

    async reportFailureForResults({
        content,
        runTime,
        isCancel,
        models,
        syncStartDate,
        error
    }: {
        content: string;
        runTime: number;
        isCancel?: true;
        models: string[];
        syncStartDate: Date;
        error: ErrorPayload;
    }) {
        if (!this.writeToDb) {
            return;
        }

        if (this.bigQueryClient && this.account && this.environment) {
            void this.bigQueryClient.insert({
                executionType: this.determineExecutionType(),
                connectionId: this.nangoConnection.connection_id,
                internalConnectionId: this.nangoConnection.id,
                accountId: this.account.id,
                accountName: this.account.name,
                scriptName: this.syncName,
                scriptType: this.syncType,
                environmentId: this.nangoConnection.environment_id,
                environmentName: this.environment.name,
                providerConfigKey: this.nangoConnection.provider_config_key,
                status: 'failed',
                syncId: this.syncId as string,
                content,
                runTimeInSeconds: runTime,
                createdAt: Date.now()
            });
        }

        if (!this.isWebhook && !this.isPostConnectionScript) {
            try {
                await this.slackNotificationService?.reportFailure(
                    this.nangoConnection,
                    this.syncName,
                    this.determineExecutionType(),
                    this.activityLogId as number,
                    this.nangoConnection.environment_id,
                    this.provider as string
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

        if (this.environment && this.sendSyncWebhook) {
            void this.sendSyncWebhook({
                connection: this.nangoConnection,
                environment: this.environment,
                syncName: this.syncName,
                model: models.join(','),
                error,
                now: syncStartDate,
                syncType: this.syncType === 'INITIAL' ? 'INITIAL' : 'INCREMENTAL',
                activityLogId: this.activityLogId,
                logCtx: this.logCtx
            });
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

        if (this.nangoConnection.id && this.activityLogId && this.logCtx?.id && this.syncId) {
            await errorNotificationService.sync.create({
                action: 'run',
                type: 'sync',
                sync_id: this.syncId,
                connection_id: this.nangoConnection.id,
                activity_log_id: this.activityLogId,
                log_id: this.logCtx?.id,
                active: true
            });
        }
    }

    private determineExecutionType(): string {
        if (this.isAction) {
            return 'action';
        } else if (this.isPostConnectionScript) {
            return 'post-connection-script';
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

function getMetricType(type: string): metrics.Types {
    switch (type) {
        case 'sync':
            return metrics.Types.SYNC_EXECUTION;
        case 'action':
            return metrics.Types.ACTION_EXECUTION;
        case 'webhook':
            return metrics.Types.WEBHOOK_EXECUTION;
        default:
            return metrics.Types.SYNC_EXECUTION;
    }
}
