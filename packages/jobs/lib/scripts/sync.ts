import type { NangoProps } from '@nangohq/shared';
import {
    addSyncConfigToJob,
    environmentService,
    externalWebhookService,
    getApiUrl,
    getLastSyncDate,
    getRunnerFlags,
    updateSyncJobStatus,
    SyncStatus,
    errorManager,
    ErrorSourceEnum,
    LogActionEnum,
    telemetry,
    LogTypes,
    errorNotificationService,
    SyncType,
    updateSyncJobResult,
    setLastSyncDate
} from '@nangohq/shared';
import { Err, metrics, stringifyError } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { DBEnvironment, DBTeam, ErrorPayload, NangoConnection, SyncResult } from '@nangohq/types';
import { sendSync as sendSyncWebhook } from '@nangohq/webhooks';
import { bigQueryClient, slackService } from '../clients.js';
import type { SyncScriptProps } from './types.js';
import { startScript } from './operations/start.js';
import { logContextGetter } from '@nangohq/logs';
import type { LogContext } from '@nangohq/logs';
import { records } from '@nangohq/records';

export async function startSync(props: SyncScriptProps & { logCtx: LogContext }): Promise<Result<void>> {
    const teamAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: props.nangoConnection.environment_id });
    if (!teamAndEnv) {
        const message = `No environment was found for ${props.nangoConnection.environment_id}. The sync cannot continue without a valid environment`;
        await onFailure({
            context: {
                environmentId: props.nangoConnection.environment_id,
                nangoConnectionId: props.nangoConnection.id!,
                connectionId: props.nangoConnection.connection_id,
                providerConfigKey: props.nangoConnection.provider_config_key,
                provider: props.provider,
                syncId: props.syncId,
                syncName: props.syncConfig.sync_name,
                syncType: props.syncType,
                syncJobId: props.syncJobId,
                activityLogId: props.logCtx.id,
                debug: props.debug || false
            },
            message,
            models: ['n/a'],
            runTime: 0,
            error: {
                type: 'no_environment',
                description: message
            }
        });
        return Err(message);
    }
    const { account: team, environment } = teamAndEnv;
    try {
        await addSyncConfigToJob(props.syncJobId, props.syncConfig.id!);
        const lastSyncDate = await getLastSyncDate(props.syncId);
        const nangoProps: NangoProps = {
            scriptType: 'sync',
            host: getApiUrl(),
            accountId: team.id,
            connectionId: props.nangoConnection.connection_id,
            environmentId: props.nangoConnection.environment_id,
            environmentName: environment.name,
            providerConfigKey: props.nangoConnection.provider_config_key,
            provider: props.provider,
            activityLogId: props.logCtx.id,
            secretKey: environment.secret_key,
            nangoConnectionId: props.nangoConnection.id!,
            syncId: props.syncId,
            syncJobId: props.syncJobId,
            attributes: props.syncConfig.attributes,
            track_deletes: props.syncConfig.track_deletes,
            syncConfig: props.syncConfig,
            debug: props.debug || false,
            runnerFlags: await getRunnerFlags(),
            startedAt: new Date(),
            ...(lastSyncDate ? { lastSyncDate } : {})
        };

        if (props.debug) {
            const content = `Last sync date is ${lastSyncDate}`;
            await props.logCtx.debug(content);
        }

        metrics.increment(metrics.Types.SYNC_EXECUTION, 1, { accountId: team.id });

        const res = await startScript({
            scriptProps: props,
            nangoProps,
            logCtx: props.logCtx
        });

        if (res.isErr()) {
            throw res.error;
        }
        return res;
    } catch (err) {
        const message = `Failed to run sync script: ${err}`;
        await onFailure({
            context: {
                environmentId: props.nangoConnection.environment_id,
                nangoConnectionId: props.nangoConnection.id!,
                connectionId: props.nangoConnection.connection_id,
                providerConfigKey: props.nangoConnection.provider_config_key,
                provider: props.provider,
                syncId: props.syncId,
                syncName: props.syncConfig.sync_name,
                syncType: props.syncType,
                syncJobId: props.syncJobId,
                activityLogId: props.logCtx.id,
                debug: props.debug || false,
                team,
                environment
            },
            message,
            runTime: 0,
            models: props.syncConfig.models,
            error: {
                type: 'script_failure',
                description: message
            }
        });
        return Err(message);
    }
}

export async function handleSyncOutput({ nangoProps }: { nangoProps: NangoProps }): Promise<void> {
    const logCtx = await logContextGetter.get({ id: String(nangoProps.activityLogId) });
    const runTime = (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000;
    try {
        if (!nangoProps.syncJobId) {
            throw new Error('syncJobId is required to update sync status');
        }
        if (!nangoProps.syncId) {
            throw new Error('syncId is required to update sync status');
        }
        if (!nangoProps.nangoConnectionId) {
            throw new Error('connectionId is required to update sync status');
        }
        const connection: NangoConnection = {
            id: nangoProps.nangoConnectionId,
            connection_id: nangoProps.connectionId,
            environment_id: nangoProps.environmentId,
            provider_config_key: nangoProps.providerConfigKey
        };
        const teamAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: nangoProps.environmentId });
        if (!teamAndEnv) {
            const message = `No environment was found for ${nangoProps.environmentId}. The sync cannot continue without a valid environment`;
            await onFailure({
                context: toContext(nangoProps),
                message,
                models: nangoProps.syncConfig.models,
                runTime,
                error: {
                    type: 'no_environment',
                    description: message
                }
            });
            return;
        }
        const { account: team, environment } = teamAndEnv;
        for (const model of nangoProps.syncConfig.models) {
            let deletedKeys: string[] = [];
            if (nangoProps.syncConfig.track_deletes) {
                deletedKeys = await records.markNonCurrentGenerationRecordsAsDeleted({
                    connectionId: nangoProps.nangoConnectionId,
                    model,
                    syncId: nangoProps.syncId,
                    generation: nangoProps.syncJobId
                });
            }

            const updatedResults: Record<string, SyncResult> = {
                [model]: {
                    added: 0,
                    updated: 0,
                    deleted: deletedKeys.length
                }
            };

            const syncResult = await updateSyncJobResult(nangoProps.syncJobId, updatedResults, model);
            if (!syncResult) {
                const message = `The sync job ${nangoProps.syncJobId} could not be updated with the results for model ${model}.`;
                await onFailure({
                    context: toContext(nangoProps),
                    models: [model],
                    message,
                    runTime,
                    error: {
                        type: 'sync_job_update_failure',
                        description: message
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
                `The ${nangoProps.syncConfig.sync_type} sync "${nangoProps.syncConfig.sync_name}" has been completed for ${model} model.` +
                (nangoProps.syncConfig.version ? ` The version integration script version ran was ${nangoProps.syncConfig.version}.` : '');

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

            const webhookSettings = await externalWebhookService.get(nangoProps.environmentId);
            if (webhookSettings) {
                void sendSyncWebhook({
                    connection: connection,
                    environment: environment,
                    webhookSettings,
                    syncName: nangoProps.syncConfig.sync_name,
                    model,
                    now: nangoProps.startedAt,
                    success: true,
                    responseResults: results,
                    operation: nangoProps.syncConfig.sync_type == SyncType.FULL ? SyncType.FULL : SyncType.INCREMENTAL,
                    logCtx
                });
            }

            await logCtx.info(content);

            await telemetry.log(
                LogTypes.SYNC_SUCCESS,
                content,
                LogActionEnum.SYNC,
                {
                    model,
                    environmentId: String(nangoProps.environmentId),
                    responseResults: JSON.stringify(result),
                    numberOfModels: '1',
                    version: nangoProps.syncConfig.version || '-1',
                    syncName: nangoProps.syncConfig.sync_name,
                    connectionDetails: JSON.stringify(connection),
                    connectionId: nangoProps.connectionId,
                    providerConfigKey: nangoProps.providerConfigKey,
                    syncId: nangoProps.syncId,
                    syncJobId: String(nangoProps.syncJobId),
                    syncType: nangoProps.syncConfig.sync_type == SyncType.FULL ? SyncType.FULL : SyncType.INCREMENTAL,
                    totalRunTime: `${runTime} seconds`,
                    debug: String(nangoProps.debug)
                },
                `syncId:${nangoProps.syncId}`
            );
        }

        await updateSyncJobStatus(nangoProps.syncJobId, SyncStatus.SUCCESS);

        // set the last sync date to when the sync started in case
        // the sync is long running to make sure we wouldn't miss
        // any changes while the sync is running
        await setLastSyncDate(nangoProps.syncId, nangoProps.startedAt);

        await slackService.removeFailingConnection(
            connection,
            nangoProps.syncConfig.sync_name,
            'sync',
            nangoProps.activityLogId as unknown as string,
            nangoProps.environmentId,
            nangoProps.provider
        );

        await errorNotificationService.sync.clear({
            sync_id: nangoProps.syncId,
            connection_id: nangoProps.nangoConnectionId
        });

        void bigQueryClient.insert({
            executionType: 'sync',
            connectionId: nangoProps.connectionId,
            internalConnectionId: nangoProps.nangoConnectionId,
            accountId: nangoProps.accountId,
            accountName: team.name,
            scriptName: nangoProps.syncConfig.sync_name,
            scriptType: nangoProps.syncConfig.type,
            environmentId: nangoProps.environmentId,
            environmentName: nangoProps.environmentName || 'unknown',
            providerConfigKey: nangoProps.providerConfigKey,
            status: 'success',
            syncId: nangoProps.syncId,
            content: `The ${nangoProps.syncConfig.sync_type} sync "${nangoProps.syncConfig.sync_name}" has been completed successfully.`,
            runTimeInSeconds: runTime,
            createdAt: Date.now()
        });

        await logCtx.success();
    } catch (err) {
        await handleSyncError({
            nangoProps,
            error: {
                type: 'script_error',
                payload: { error: stringifyError(err, { pretty: true }) },
                status: 500
            }
        });
    }
}

export async function handleSyncError({
    nangoProps,
    error
}: {
    nangoProps: NangoProps;
    error: { type: string; payload: Record<string, unknown>; status: number };
}): Promise<void> {
    const version = nangoProps.syncConfig.version ? ` version: ${nangoProps.syncConfig.version}` : '';
    const message = `The ${nangoProps.syncConfig.sync_type} sync "${nangoProps.syncConfig.sync_name}"${version} sync did not complete successfully: ${JSON.stringify(error.payload)}`; //TODO: payload?????????
    await onFailure({
        context: toContext(nangoProps),
        models: nangoProps.syncConfig.models,
        message,
        runTime: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
        error: {
            type: 'script_error',
            description: message
        }
    });
    // TODO: logging????????
}

interface ScriptContext {
    environmentId: number;
    connectionId: string;
    nangoConnectionId: number;
    providerConfigKey: string;
    provider: string;
    syncId: string;
    syncName: string;
    syncType: SyncType.INCREMENTAL | SyncType.FULL;
    syncJobId: number;
    lastSyncDate?: Date | undefined;
    activityLogId: string;
    debug: boolean;
    team?: DBTeam;
    environment?: DBEnvironment;
}
function toContext(nangoProps: NangoProps): ScriptContext {
    return {
        environmentId: nangoProps.environmentId,
        nangoConnectionId: nangoProps.nangoConnectionId!,
        connectionId: nangoProps.connectionId,
        providerConfigKey: nangoProps.providerConfigKey,
        provider: nangoProps.provider,
        syncId: nangoProps.syncId!,
        syncName: nangoProps.syncConfig.sync_name,
        syncType: nangoProps.syncConfig.sync_type == SyncType.FULL ? SyncType.FULL : SyncType.INCREMENTAL,
        syncJobId: nangoProps.syncJobId!,
        activityLogId: String(nangoProps.activityLogId),
        debug: nangoProps.debug
    };
}

async function onFailure({
    context,
    models,
    runTime,
    message,
    isCancel,
    error
}: {
    context: ScriptContext;
    models: string[];
    runTime: number;
    message: string;
    isCancel?: true;
    error: ErrorPayload;
}) {
    if (context.team && context.environment) {
        void bigQueryClient.insert({
            executionType: 'sync',
            connectionId: context.connectionId,
            internalConnectionId: context.nangoConnectionId,
            accountId: context.team.id,
            accountName: context.team.name,
            scriptName: context.syncName,
            scriptType: 'sync',
            environmentId: context.environmentId,
            environmentName: context.environment.name,
            providerConfigKey: context.providerConfigKey,
            status: 'failed',
            syncId: context.syncId,
            content: message,
            runTimeInSeconds: runTime,
            createdAt: Date.now()
        });
    }

    const connection: NangoConnection = {
        id: context.nangoConnectionId,
        connection_id: context.connectionId,
        environment_id: context.environmentId,
        provider_config_key: context.providerConfigKey
    };
    const logCtx = await logContextGetter.get({ id: context.activityLogId });
    try {
        await slackService.reportFailure(connection, context.syncName, 'sync', logCtx.id, context.environmentId, context.provider);
    } catch {
        errorManager.report('slack notification service reported a failure', {
            environmentId: context.environmentId,
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.SYNC,
            metadata: {
                syncName: context.syncName,
                connectionDetails: connection,
                syncId: context.syncId,
                syncJobId: context.syncJobId,
                syncType: context.syncType,
                debug: context.debug
            }
        });
    }

    if (context.environment) {
        const webhookSettings = await externalWebhookService.get(context.environment.id);

        void sendSyncWebhook({
            connection: connection,
            environment: context.environment,
            webhookSettings,
            syncName: context.syncName,
            model: models.join(','),
            success: false,
            error,
            now: context.lastSyncDate,
            operation: context.syncType,
            logCtx: logCtx
        });
    }

    await updateSyncJobStatus(context.syncJobId, SyncStatus.STOPPED);

    await logCtx.error(message);
    if (isCancel) {
        await logCtx.cancel();
    } else {
        await logCtx.failed();
    }

    errorManager.report(message, {
        environmentId: context.environmentId,
        source: ErrorSourceEnum.CUSTOMER,
        operation: LogActionEnum.SYNC,
        metadata: {
            syncName: context.syncName,
            connectionDetails: connection,
            syncId: context.syncId,
            syncJobId: context.syncJobId,
            syncType: 'sync',
            debug: context.debug
        }
    });

    await telemetry.log(
        LogTypes.SYNC_FAILURE,
        message,
        LogActionEnum.SYNC,
        {
            environmentId: String(context.environmentId),
            syncName: context.syncName,
            connectionDetails: JSON.stringify(connection),
            connectionId: context.connectionId,
            providerConfigKey: context.providerConfigKey,
            syncId: context.syncId,
            syncJobId: String(context.syncJobId),
            syncType: context.syncType,
            debug: String(context.debug),
            level: 'error'
        },
        `syncId:${context.syncId}`
    );

    await errorNotificationService.sync.create({
        action: 'run',
        type: 'sync',
        sync_id: context.syncId,
        connection_id: context.nangoConnectionId,
        log_id: logCtx.id,
        active: true
    });
}
