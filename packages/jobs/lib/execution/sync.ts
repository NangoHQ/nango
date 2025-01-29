import tracer from 'dd-trace';
import type { Config, Job } from '@nangohq/shared';
import {
    environmentService,
    externalWebhookService,
    getApiUrl,
    getLastSyncDate,
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
    setLastSyncDate,
    NangoError,
    configService,
    createSyncJob,
    getSyncConfigRaw,
    getSyncJobByRunId,
    getEndUserByConnectionId,
    featureFlags
} from '@nangohq/shared';
import { Err, Ok, metrics } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { DBEnvironment, DBSyncConfig, DBTeam, NangoConnection, NangoProps, SyncResult, SyncTypeLiteral } from '@nangohq/types';
import { sendSync as sendSyncWebhook } from '@nangohq/webhooks';
import { bigQueryClient, orchestratorClient, slackService } from '../clients.js';
import { startScript } from './operations/start.js';
import { logContextGetter } from '@nangohq/logs';
import type { LogContext } from '@nangohq/logs';
import { records } from '@nangohq/records';
import type { TaskSync, TaskSyncAbort } from '@nangohq/nango-orchestrator';
import { abortScript } from './operations/abort.js';
import { logger } from '../logger.js';
import db from '@nangohq/database';
import { getRunnerFlags } from '../utils/flags.js';

export async function startSync(task: TaskSync, startScriptFn = startScript): Promise<Result<NangoProps>> {
    let logCtx: LogContext | undefined;
    let team: DBTeam | undefined;
    let environment: DBEnvironment | undefined;
    let syncJob: Job | null = null;
    let lastSyncDate: Date | null = null;
    let syncType: SyncTypeLiteral = 'full';
    let providerConfig: Config | null = null;
    let syncConfig: DBSyncConfig | null = null;
    let endUser: NangoProps['endUser'] | null = null;

    try {
        lastSyncDate = await getLastSyncDate(task.syncId);
        providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
        if (providerConfig === null) {
            throw new Error(`Provider config not found for connection: ${task.connection.connection_id}. TaskId: ${task.id}`);
        }

        syncConfig = await getSyncConfigRaw({
            environmentId: task.connection.environment_id,
            config_id: providerConfig.id!,
            name: task.syncName,
            isAction: false
        });

        if (!syncConfig) {
            throw new Error(`Sync config not found. TaskId: ${task.id}`);
        }

        const accountAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: task.connection.environment_id });
        if (!accountAndEnv) {
            throw new Error(`Account and environment not found`);
        }
        team = accountAndEnv.account;
        environment = accountAndEnv.environment;

        const getEndUser = await getEndUserByConnectionId(db.knex, { connectionId: task.connection.id });
        if (getEndUser.isOk()) {
            endUser = { id: getEndUser.value.id, endUserId: getEndUser.value.endUserId, orgId: getEndUser.value.organization?.organizationId || null };
        }

        syncType = syncConfig.sync_type?.toLowerCase() === 'incremental' && lastSyncDate ? 'incremental' : 'full';

        logCtx = await logContextGetter.create(
            { operation: { type: 'sync', action: 'run' } },
            {
                account: team,
                environment,
                integration: { id: providerConfig.id!, name: providerConfig.unique_key, provider: providerConfig.provider },
                connection: { id: task.connection.id, name: task.connection.connection_id },
                syncConfig: { id: syncConfig.id, name: syncConfig.sync_name },
                meta: { scriptVersion: syncConfig.version }
            }
        );

        syncJob = await createSyncJob({
            sync_id: task.syncId,
            type: syncType === 'full' ? SyncType.FULL : SyncType.INCREMENTAL,
            status: SyncStatus.RUNNING,
            job_id: task.name,
            nangoConnection: task.connection,
            sync_config_id: syncConfig.id,
            run_id: task.id,
            log_id: logCtx.id
        });
        if (!syncJob) {
            throw new Error(`Failed to create sync job for sync: ${task.syncId}. TaskId: ${task.id}`);
        }

        await logCtx.info(`Starting sync '${task.syncName}'`, {
            syncName: task.syncName,
            syncType,
            connection: task.connection.connection_id,
            integration: task.connection.provider_config_key,
            syncId: task.syncId,
            syncJobId: syncJob.id,
            attempt: task.attempt,
            executionId: task.id
        });

        const nangoProps: NangoProps = {
            scriptType: 'sync',
            host: getApiUrl(),
            team: {
                id: team.id,
                name: team.name
            },
            connectionId: task.connection.connection_id,
            environmentId: task.connection.environment_id,
            environmentName: environment.name,
            providerConfigKey: task.connection.provider_config_key,
            provider: providerConfig.provider,
            activityLogId: logCtx.id,
            secretKey: environment.secret_key,
            nangoConnectionId: task.connection.id,
            syncId: task.syncId,
            syncJobId: syncJob.id,
            attributes: syncConfig.attributes,
            track_deletes: syncConfig.track_deletes,
            syncConfig,
            debug: task.debug || false,
            runnerFlags: await getRunnerFlags(featureFlags),
            startedAt: new Date(),
            ...(lastSyncDate ? { lastSyncDate } : {}),
            endUser
        };

        if (task.debug) {
            await logCtx.debug(`Last sync date is`, lastSyncDate);
        }

        metrics.increment(metrics.Types.SYNC_EXECUTION, 1, { accountId: team.id });

        const res = await startScriptFn({
            taskId: task.id,
            nangoProps,
            logCtx: logCtx
        });

        if (res.isErr()) {
            throw res.error;
        }
        return Ok(nangoProps);
    } catch (err) {
        const error = new NangoError('sync_script_failure', { error: err instanceof Error ? err.message : err });
        await onFailure({
            connection: task.connection,
            provider: providerConfig?.provider || 'unknown',
            providerConfig: providerConfig,
            syncId: task.syncId,
            syncName: syncConfig?.sync_name || 'unknown',
            syncType: syncType,
            syncJobId: syncJob?.id || -1,
            activityLogId: logCtx?.id || 'unknown',
            debug: task.debug,
            team: team,
            environment,
            syncConfig,
            runTime: 0,
            models: syncConfig?.models || [],
            error,
            endUser
        });
        return Err(error);
    }
}

export async function handleSyncSuccess({ nangoProps }: { nangoProps: NangoProps }): Promise<void> {
    const logCtx = await logContextGetter.get({ id: String(nangoProps.activityLogId) });
    const runTime = (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000;
    const syncType: SyncTypeLiteral = nangoProps.syncConfig.sync_type?.toLocaleLowerCase() === 'full' ? 'full' : 'incremental';

    let team: DBTeam | undefined;
    let environment: DBEnvironment | undefined;
    let providerConfig: Config | null = null;

    try {
        const accountAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: nangoProps.environmentId });
        if (!accountAndEnv) {
            throw new Error(`Account and environment not found`);
        }
        team = accountAndEnv.account;
        environment = accountAndEnv.environment;

        if (!nangoProps.syncJobId) {
            throw new Error('syncJobId is required to update sync status');
        }
        if (!nangoProps.syncId) {
            throw new Error('syncId is required to update sync status');
        }
        if (!nangoProps.nangoConnectionId) {
            throw new Error('connectionId is required to update sync status');
        }
        const lastSyncDate = await getLastSyncDate(nangoProps.syncId);
        const connection: NangoConnection = {
            id: nangoProps.nangoConnectionId,
            connection_id: nangoProps.connectionId,
            environment_id: nangoProps.environmentId,
            provider_config_key: nangoProps.providerConfigKey
        };

        providerConfig = await configService.getProviderConfig(connection.provider_config_key, connection.environment_id);
        if (!providerConfig) {
            throw new Error(`Provider config not found for connection: ${connection.connection_id}`);
        }

        const syncPayload = {
            records: {} as Record<string, SyncResult>,
            runTimeSecs: runTime
        };
        const webhookSettings = await externalWebhookService.get(nangoProps.environmentId);
        for (const model of nangoProps.syncConfig.models || []) {
            let deletedKeys: string[] = [];
            if (nangoProps.syncConfig.track_deletes) {
                deletedKeys = await records.markPreviousGenerationRecordsAsDeleted({
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
                await onFailure({
                    team,
                    environment,
                    connection,
                    provider: nangoProps.provider,
                    providerConfig,
                    syncId: nangoProps.syncId,
                    syncName: nangoProps.syncConfig.sync_name,
                    syncType,
                    syncJobId: nangoProps.syncJobId,
                    debug: nangoProps.debug,
                    activityLogId: nangoProps.activityLogId!,
                    models: [model],
                    runTime,
                    syncConfig: nangoProps.syncConfig,
                    error: new NangoError('sync_job_update_failure', { syncJobId: nangoProps.syncJobId, model }),
                    endUser: nangoProps.endUser
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

            syncPayload.records[model] = { added, updated, deleted };

            if (webhookSettings && environment) {
                const span = tracer.startSpan('jobs.sync.webhook', {
                    tags: {
                        environmentId: nangoProps.environmentId,
                        connectionId: nangoProps.connectionId,
                        syncId: nangoProps.syncId,
                        syncJobId: nangoProps.syncJobId,
                        syncSuccess: true,
                        model
                    }
                });

                void tracer.scope().activate(span, async () => {
                    try {
                        if (team && environment && providerConfig) {
                            const res = await sendSyncWebhook({
                                account: team,
                                connection: connection,
                                environment: environment,
                                syncConfig: nangoProps.syncConfig,
                                providerConfig,
                                webhookSettings,
                                model,
                                now: nangoProps.startedAt,
                                success: true,
                                responseResults: {
                                    added,
                                    updated,
                                    deleted
                                },
                                operation: lastSyncDate ? SyncType.INCREMENTAL : SyncType.FULL
                            });

                            if (res.isErr()) {
                                throw new Error(`Failed to send webhook for sync: ${nangoProps.syncConfig.sync_name}`);
                            }
                        } else {
                            const missing: string[] = [];
                            if (!team) {
                                missing.push('team');
                            }

                            if (!environment) {
                                missing.push('environment');
                            }

                            if (!providerConfig) {
                                missing.push('providerConfig');
                            }

                            throw new Error(`Failed to send webhook for sync: ${nangoProps.syncConfig.sync_name}, missing ${missing.join(',')}`);
                        }
                    } catch (err) {
                        span?.setTag('error', err);
                    } finally {
                        span.finish();
                    }
                });
            }

            await telemetry.log(
                LogTypes.SYNC_SUCCESS,
                `${nangoProps.syncConfig.sync_type || 'The'} sync '${nangoProps.syncConfig.sync_name}' for model ${model} was completed successfully`,
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
                    syncType: nangoProps.syncConfig.sync_type!,
                    totalRunTime: `${runTime} seconds`,
                    debug: String(nangoProps.debug)
                },
                `syncId:${nangoProps.syncId}`
            );
        }

        await logCtx.enrichOperation({
            meta: syncPayload
        });

        await logCtx.info(
            `${nangoProps.syncConfig.sync_type ? nangoProps.syncConfig.sync_type.replace(/^./, (c) => c.toUpperCase()) : 'The '} sync '${nangoProps.syncConfig.sync_name}' completed successfully`,
            syncPayload
        );

        await updateSyncJobStatus(nangoProps.syncJobId, SyncStatus.SUCCESS);

        // set the last sync date to when the sync started in case
        // the sync is long running to make sure we wouldn't miss
        // any changes while the sync is running
        await setLastSyncDate(nangoProps.syncId, nangoProps.startedAt);

        await slackService.removeFailingConnection({
            connection,
            name: nangoProps.syncConfig.sync_name,
            type: 'sync',
            originalActivityLogId: nangoProps.activityLogId as unknown as string,
            environment_id: nangoProps.environmentId,
            provider: nangoProps.provider
        });

        await errorNotificationService.sync.clear({
            sync_id: nangoProps.syncId,
            connection_id: nangoProps.nangoConnectionId
        });

        void bigQueryClient.insert({
            executionType: 'sync',
            connectionId: nangoProps.connectionId,
            internalConnectionId: nangoProps.nangoConnectionId,
            accountId: nangoProps.team?.id,
            accountName: nangoProps.team?.name || 'unknown',
            scriptName: nangoProps.syncConfig.sync_name,
            scriptType: nangoProps.syncConfig.type,
            environmentId: nangoProps.environmentId,
            environmentName: nangoProps.environmentName || 'unknown',
            providerConfigKey: nangoProps.providerConfigKey,
            status: 'success',
            syncId: nangoProps.syncId,
            content: `The sync "${nangoProps.syncConfig.sync_name}" has been completed successfully.`,
            runTimeInSeconds: runTime,
            createdAt: Date.now(),
            internalIntegrationId: nangoProps.syncConfig.nango_config_id,
            endUser: nangoProps.endUser
        });

        metrics.duration(metrics.Types.SYNC_TRACK_RUNTIME, Date.now() - nangoProps.startedAt.getTime());
        metrics.increment(metrics.Types.SYNC_SUCCESS);

        await logCtx.success();
    } catch (err) {
        await onFailure({
            team,
            environment,
            connection: {
                id: nangoProps.nangoConnectionId!,
                connection_id: nangoProps.connectionId,
                environment_id: nangoProps.environmentId,
                provider_config_key: nangoProps.providerConfigKey
            },
            provider: nangoProps.provider,
            providerConfig,
            syncId: nangoProps.syncId!,
            syncName: nangoProps.syncConfig.sync_name,
            syncType,
            syncJobId: nangoProps.syncJobId!,
            activityLogId: nangoProps.activityLogId!,
            syncConfig: nangoProps.syncConfig,
            debug: nangoProps.debug,
            models: nangoProps.syncConfig.models || [],

            runTime: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
            failureSource: ErrorSourceEnum.CUSTOMER,
            isCancel: false,
            error: new NangoError('sync_script_failure', { error: err instanceof Error ? err.message : err }),
            endUser: nangoProps.endUser
        });
    }
}

export async function handleSyncError({ nangoProps, error }: { nangoProps: NangoProps; error: NangoError }): Promise<void> {
    let team: DBTeam | undefined;
    let environment: DBEnvironment | undefined;
    let providerConfig: Config | null = null;

    const accountAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: nangoProps.environmentId });
    if (accountAndEnv) {
        team = accountAndEnv.account;
        environment = accountAndEnv.environment;
    }

    providerConfig = await configService.getProviderConfig(nangoProps.providerConfigKey, nangoProps.environmentId);
    if (!providerConfig) {
        throw new Error(`Provider config not found for connection: ${nangoProps.nangoConnectionId}`);
    }

    await onFailure({
        team,
        environment,
        connection: {
            id: nangoProps.nangoConnectionId!,
            connection_id: nangoProps.connectionId,
            environment_id: nangoProps.environmentId,
            provider_config_key: nangoProps.providerConfigKey
        },
        provider: nangoProps.provider,
        providerConfig,
        syncId: nangoProps.syncId!,
        syncName: nangoProps.syncConfig.sync_name,
        syncType: nangoProps.syncConfig.sync_type!,
        syncJobId: nangoProps.syncJobId!,
        activityLogId: nangoProps.activityLogId!,
        debug: nangoProps.debug,
        syncConfig: nangoProps.syncConfig,
        models: nangoProps.syncConfig.models || [],
        runTime: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
        failureSource: ErrorSourceEnum.CUSTOMER,
        isCancel: false,
        error,
        endUser: nangoProps.endUser
    });
}

export async function abortSync(task: TaskSyncAbort): Promise<Result<void>> {
    try {
        const accountAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: task.connection.environment_id });
        if (!accountAndEnv) {
            throw new Error(`Account and environment not found`);
        }
        const { account: team, environment } = accountAndEnv;

        const abortedScript = await abortScript({ taskId: task.abortedTask.id, teamId: team.id });
        if (abortedScript.isErr()) {
            logger.error(`failed to abort script for task ${task.abortedTask.id}`, abortedScript.error);
        }

        const syncJob = await getSyncJobByRunId(task.abortedTask.id);
        if (!syncJob) {
            throw new Error(`Sync job not found for syncId: ${task.syncId}`);
        }

        const providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
        if (providerConfig === null) {
            throw new Error(`Provider config not found for connection: ${task.connection.connection_id}. TaskId: ${task.id}`);
        }

        const syncConfig = await getSyncConfigRaw({
            environmentId: providerConfig.environment_id,
            config_id: providerConfig.id!,
            name: task.syncName,
            isAction: false
        });

        if (!syncConfig) {
            throw new Error(`Sync config not found. TaskId: ${task.id}`);
        }

        const getEndUser = await getEndUserByConnectionId(db.knex, { connectionId: task.connection.id });

        const isCancel = task.abortedTask.state === 'CANCELLED';
        await onFailure({
            connection: {
                id: task.connection.id,
                connection_id: task.connection.connection_id,
                environment_id: task.connection.environment_id,
                provider_config_key: task.connection.provider_config_key
            },
            provider: providerConfig.provider,
            providerConfig,
            syncId: task.syncId,
            syncType: syncConfig.sync_type!,
            syncName: syncConfig.sync_name,
            syncJobId: syncJob.id,
            activityLogId: syncJob.log_id!,
            debug: task.debug,
            team,
            environment,
            models: [],
            isCancel,
            failureSource: ErrorSourceEnum.CUSTOMER,
            syncConfig,
            runTime: 0,
            error: new NangoError('sync_script_failure', task.reason),
            endUser: getEndUser.isOk()
                ? { id: getEndUser.value.id, endUserId: getEndUser.value.endUserId, orgId: getEndUser.value.organization?.organizationId || null }
                : null
        });
        const setSuccess = await orchestratorClient.succeed({ taskId: task.id, output: {} });
        if (setSuccess.isErr()) {
            logger.error(`failed to set cancel task ${task.id} as succeeded`, setSuccess.error);
        }
        return Ok(undefined);
    } catch (err) {
        const error = new Error(`Failed to cancel`, { cause: err });
        const setFailed = await orchestratorClient.failed({ taskId: task.id, error });
        if (setFailed.isErr()) {
            logger.error(`failed to set cancel task ${task.id} as failed`, setFailed.error);
        }
        return Err(error);
    }
}

async function onFailure({
    team,
    environment,
    connection,
    provider,
    providerConfig,
    syncId,
    syncName,
    syncType,
    syncJobId,
    lastSyncDate,
    activityLogId,
    debug,
    models,
    syncConfig,
    runTime,
    isCancel,
    failureSource,
    error,
    endUser
}: {
    team?: DBTeam | undefined;
    environment?: DBEnvironment | undefined;
    connection: NangoConnection;
    provider: string;
    providerConfig: Config | null;
    syncId: string;
    syncName: string;
    syncType: SyncTypeLiteral;
    syncJobId: number;
    lastSyncDate?: Date | undefined;
    activityLogId: string;
    debug: boolean;
    models: string[];
    runTime: number;
    isCancel?: boolean;
    syncConfig: DBSyncConfig | null;
    failureSource?: ErrorSourceEnum;
    error: NangoError;
    endUser: NangoProps['endUser'];
}): Promise<void> {
    if (team && environment) {
        void bigQueryClient.insert({
            executionType: 'sync',
            connectionId: connection.connection_id,
            internalConnectionId: connection.id,
            accountId: team.id,
            accountName: team.name,
            scriptName: syncName,
            scriptType: 'sync',
            environmentId: environment.id,
            environmentName: environment.name,
            providerConfigKey: connection.provider_config_key,
            status: 'failed',
            syncId: syncId,
            content: error.message,
            runTimeInSeconds: runTime,
            createdAt: Date.now(),
            internalIntegrationId: syncConfig?.nango_config_id || null,
            endUser
        });
    }

    const logCtx = await logContextGetter.get({ id: activityLogId });
    try {
        await slackService.reportFailure(connection, syncName, 'sync', logCtx.id, connection.environment_id, provider);
    } catch {
        errorManager.report('slack notification service reported a failure', {
            environmentId: connection.environment_id,
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.SYNC,
            metadata: {
                syncName: syncName,
                connectionDetails: connection,
                syncId: syncId,
                syncJobId: syncJobId,
                syncType: syncType,
                debug: debug
            }
        });
    }

    if (environment) {
        const webhookSettings = await externalWebhookService.get(environment.id);

        const span = tracer.startSpan('jobs.sync.webhook', {
            tags: {
                environmentId: environment.id,
                connectionId: connection.id,
                syncId: syncId,
                syncJobId: syncJobId,
                syncSuccess: false
            }
        });

        if (team && environment && syncConfig && providerConfig) {
            void tracer.scope().activate(span, async () => {
                try {
                    const res = await sendSyncWebhook({
                        account: team,
                        providerConfig,
                        syncConfig,
                        connection: connection,
                        environment: environment,
                        webhookSettings,
                        model: models.join(','),
                        success: false,
                        error: {
                            type: 'script_error',
                            description: error.message
                        },
                        now: lastSyncDate,
                        operation: lastSyncDate ? SyncType.INCREMENTAL : SyncType.FULL
                    });

                    if (res.isErr()) {
                        throw new Error(`Failed to send webhook for sync: ${syncName}`);
                    }
                } catch (err) {
                    span?.setTag('error', err);
                } finally {
                    span.finish();
                }
            });
        }
    }

    await updateSyncJobStatus(syncJobId, SyncStatus.STOPPED);

    await logCtx.enrichOperation({ error });
    if (isCancel) {
        await logCtx.cancel();
    } else {
        await logCtx.failed();
    }

    errorManager.report(error.message, {
        environmentId: connection.environment_id,
        source: failureSource || ErrorSourceEnum.PLATFORM,
        operation: LogActionEnum.SYNC,
        metadata: {
            syncName: syncName,
            connectionDetails: connection,
            syncId: syncId,
            syncJobId: syncJobId,
            syncType: 'sync',
            debug: debug
        }
    });

    await telemetry.log(
        LogTypes.SYNC_FAILURE,
        error.message,
        LogActionEnum.SYNC,
        {
            environmentId: String(connection.environment_id),
            syncName: syncName,
            connectionDetails: JSON.stringify(connection),
            connectionId: connection.connection_id,
            providerConfigKey: connection.provider_config_key,
            syncId: syncId,
            syncJobId: String(syncJobId),
            syncType: syncType,
            debug: String(debug),
            level: 'error'
        },
        `syncId:${syncId}`
    );

    await errorNotificationService.sync.create({
        action: 'run',
        type: 'sync',
        sync_id: syncId,
        connection_id: connection.id!,
        log_id: logCtx.id,
        active: true
    });

    metrics.increment(metrics.Types.SYNC_FAILURE);
}
