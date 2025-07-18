import tracer from 'dd-trace';

import db from '@nangohq/database';
import { OtlpSpan, getFormattedOperation, logContextGetter } from '@nangohq/logs';
import { records } from '@nangohq/records';
import {
    ErrorSourceEnum,
    LogActionEnum,
    NangoError,
    SyncJobsType,
    SyncStatus,
    configService,
    createSyncJob,
    environmentService,
    errorManager,
    errorNotificationService,
    externalWebhookService,
    getApiUrl,
    getEndUserByConnectionId,
    getLastSyncDate,
    getSyncConfigRaw,
    getSyncJobByRunId,
    setLastSyncDate,
    updateSyncJobResult,
    updateSyncJobStatus
} from '@nangohq/shared';
import { Err, Ok, metrics, tagTraceUser } from '@nangohq/utils';
import { sendSync as sendSyncWebhook } from '@nangohq/webhooks';

import { bigQueryClient, orchestratorClient, slackService } from '../clients.js';
import { logger } from '../logger.js';
import { abortTaskWithId } from './operations/abort.js';
import { startScript } from './operations/start.js';
import { getRunnerFlags } from '../utils/flags.js';
import { setTaskFailed, setTaskSuccess } from './operations/state.js';

import type { LogContextOrigin } from '@nangohq/logs';
import type { TaskSync, TaskSyncAbort } from '@nangohq/nango-orchestrator';
import type { Config, Job } from '@nangohq/shared';
import type { ConnectionJobs, DBEnvironment, DBSyncConfig, DBTeam, NangoProps, SyncResult, SyncTypeLiteral } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export async function startSync(task: TaskSync, startScriptFn = startScript): Promise<Result<NangoProps>> {
    let logCtx: LogContextOrigin | undefined;
    let team: DBTeam | undefined;
    let environment: DBEnvironment | undefined;
    let syncJob: Job | null = null;
    let lastSyncDate: Date | null = null;
    let syncType: SyncTypeLiteral = 'full';
    let providerConfig: Config | null = null;
    let syncConfig: DBSyncConfig | null = null;
    let endUser: NangoProps['endUser'] | null = null;
    const startedAt = new Date();

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
        if (!syncConfig.enabled) {
            throw new Error(`Sync is disabled: ${task.id}`);
        }

        const accountAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: task.connection.environment_id });
        if (!accountAndEnv) {
            throw new Error(`Account and environment not found`);
        }
        team = accountAndEnv.account;
        environment = accountAndEnv.environment;
        tagTraceUser(accountAndEnv);

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
        logCtx.attachSpan(new OtlpSpan(logCtx.operation, startedAt));

        syncJob = await createSyncJob({
            sync_id: task.syncId,
            type: syncType === 'full' ? SyncJobsType.FULL : SyncJobsType.INCREMENTAL,
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

        void logCtx.info(`Starting sync '${task.syncName}'`, {
            syncName: task.syncName,
            syncVariant: task.syncVariant,
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
            syncVariant: task.syncVariant,
            syncJobId: syncJob.id,
            attributes: syncConfig.attributes,
            track_deletes: syncConfig.track_deletes,
            syncConfig,
            debug: task.debug || false,
            runnerFlags: await getRunnerFlags(),
            startedAt,
            ...(lastSyncDate ? { lastSyncDate } : {}),
            endUser,
            heartbeatTimeoutSecs: task.heartbeatTimeoutSecs
        };

        if (task.debug) {
            void logCtx.debug(`Last sync date is ${lastSyncDate?.toISOString()}`);
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
        const syncJobId = syncJob?.id;
        if (syncJobId) {
            await updateSyncJobStatus(syncJobId, SyncStatus.STOPPED);
        }
        await onFailure({
            connection: task.connection,
            provider: providerConfig?.provider || 'unknown',
            providerConfig: providerConfig,
            syncId: task.syncId,
            syncVariant: task.syncVariant,
            syncName: syncConfig?.sync_name || 'unknown',
            syncType: syncType,
            syncJobId,
            activityLogId: logCtx?.id,
            debug: task.debug,
            team: team,
            environment,
            syncConfig,
            runTime: 0,
            models: syncConfig?.models || [],
            error,
            endUser,
            startedAt
        });
        return Err(error);
    }
}

export async function handleSyncSuccess({ taskId, nangoProps }: { taskId: string; nangoProps: NangoProps }): Promise<void> {
    const logCtx = logContextGetter.get({ id: nangoProps.activityLogId, accountId: nangoProps.team.id });
    logCtx.attachSpan(
        new OtlpSpan(
            getFormattedOperation(
                { operation: { type: 'sync', action: 'run' } },
                {
                    account: nangoProps.team,
                    environment: { id: nangoProps.environmentId, name: nangoProps.environmentName },
                    integration: { id: nangoProps.syncConfig.nango_config_id, name: nangoProps.providerConfigKey, provider: nangoProps.provider },
                    connection: { id: nangoProps.nangoConnectionId, name: nangoProps.connectionId },
                    syncConfig: { id: nangoProps.syncConfig.id, name: nangoProps.syncConfig.sync_name },
                    meta: { scriptVersion: nangoProps.syncConfig.version }
                }
            ),
            nangoProps.startedAt
        )
    );

    const runTime = (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000;
    const syncType: SyncTypeLiteral = nangoProps.syncConfig.sync_type === 'full' ? 'full' : 'incremental';

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
        const connection: ConnectionJobs = {
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
                void logCtx.info(`${model}: "track_deletes" post deleted ${deletedKeys.length} records`);
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
                    syncVariant: nangoProps.syncVariant || 'base',
                    syncName: nangoProps.syncConfig.sync_name,
                    syncType,
                    syncJobId: nangoProps.syncJobId,
                    debug: nangoProps.debug,
                    activityLogId: nangoProps.activityLogId,
                    models: [model],
                    runTime,
                    syncConfig: nangoProps.syncConfig,
                    error: new NangoError('sync_job_update_failure', { syncJobId: nangoProps.syncJobId, model }),
                    endUser: nangoProps.endUser,
                    startedAt: nangoProps.startedAt
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
                                syncVariant: nangoProps.syncVariant || 'base',
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
                                operation: lastSyncDate ? SyncJobsType.INCREMENTAL : SyncJobsType.FULL
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
        }

        await logCtx.enrichOperation({
            meta: syncPayload
        });

        void logCtx.info(
            `${nangoProps.syncConfig.sync_type ? nangoProps.syncConfig.sync_type.replace(/^./, (c) => c.toUpperCase()) : 'The '} sync '${nangoProps.syncConfig.sync_name}' completed successfully`,
            syncPayload
        );

        // set the last sync date to when the sync started in case
        // the sync is long running to make sure we wouldn't miss
        // any changes while the sync is running
        await setLastSyncDate(nangoProps.syncId, nangoProps.startedAt);

        if (nangoProps.syncJobId) {
            await updateSyncJobStatus(nangoProps.syncJobId, SyncStatus.SUCCESS);
        }
        await setTaskSuccess({ taskId, output: null });

        await slackService.removeFailingConnection({
            connection,
            name: nangoProps.syncVariant === 'base' ? nangoProps.syncConfig.sync_name : `${nangoProps.syncConfig.sync_name}::${nangoProps.syncVariant}`,
            type: 'sync',
            originalActivityLogId: nangoProps.activityLogId,
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
            syncVariant: nangoProps.syncVariant!,
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
                id: nangoProps.nangoConnectionId,
                connection_id: nangoProps.connectionId,
                environment_id: nangoProps.environmentId,
                provider_config_key: nangoProps.providerConfigKey
            },
            provider: nangoProps.provider,
            providerConfig,
            syncId: nangoProps.syncId!,
            syncVariant: nangoProps.syncVariant!,
            syncName: nangoProps.syncConfig.sync_name,
            syncType,
            syncJobId: nangoProps.syncJobId!,
            activityLogId: nangoProps.activityLogId,
            syncConfig: nangoProps.syncConfig,
            debug: nangoProps.debug,
            models: nangoProps.syncConfig.models || [],

            runTime: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
            failureSource: ErrorSourceEnum.CUSTOMER,
            isCancel: false,
            error: new NangoError('sync_script_failure', { error: err instanceof Error ? err.message : err }),
            endUser: nangoProps.endUser,
            startedAt: nangoProps.startedAt
        });
    }
}

export async function handleSyncError({ taskId, nangoProps, error }: { taskId: string; nangoProps: NangoProps; error: NangoError }): Promise<void> {
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

    if (nangoProps.syncJobId) {
        await updateSyncJobStatus(nangoProps.syncJobId, SyncStatus.STOPPED);
    }
    await setTaskFailed({ taskId, error });

    await onFailure({
        team,
        environment,
        connection: {
            id: nangoProps.nangoConnectionId,
            connection_id: nangoProps.connectionId,
            environment_id: nangoProps.environmentId,
            provider_config_key: nangoProps.providerConfigKey
        },
        provider: nangoProps.provider,
        providerConfig,
        syncId: nangoProps.syncId!,
        syncVariant: nangoProps.syncVariant!,
        syncName: nangoProps.syncConfig.sync_name,
        syncType: nangoProps.syncConfig.sync_type!,
        syncJobId: nangoProps.syncJobId!,
        activityLogId: nangoProps.activityLogId,
        debug: nangoProps.debug,
        syncConfig: nangoProps.syncConfig,
        models: nangoProps.syncConfig.models || [],
        runTime: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
        failureSource: ErrorSourceEnum.CUSTOMER,
        isCancel: false,
        error,
        endUser: nangoProps.endUser,
        startedAt: nangoProps.startedAt
    });
}

export async function abortSync(task: TaskSyncAbort): Promise<Result<void>> {
    try {
        const accountAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: task.connection.environment_id });
        if (!accountAndEnv) {
            throw new Error(`Account and environment not found`);
        }
        const { account: team, environment } = accountAndEnv;

        const abortedScript = await abortTaskWithId({ taskId: task.abortedTask.id, teamId: team.id });
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
        if (!syncConfig.enabled) {
            throw new Error(`Sync is disabled: ${task.id}`);
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
            syncVariant: task.syncVariant,
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
                : null,
            startedAt: new Date()
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
    syncVariant,
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
    endUser,
    startedAt
}: {
    team?: DBTeam | undefined;
    environment?: DBEnvironment | undefined;
    connection: ConnectionJobs;
    provider: string;
    providerConfig: Config | null;
    syncId: string;
    syncVariant: string;
    syncName: string;
    syncType: SyncTypeLiteral;
    syncJobId: number | undefined;
    lastSyncDate?: Date | undefined;
    activityLogId?: string | undefined;
    debug: boolean;
    models: string[];
    runTime: number;
    startedAt: Date;
    isCancel?: boolean;
    syncConfig: DBSyncConfig | null;
    failureSource?: ErrorSourceEnum;
    error: NangoError;
    endUser: NangoProps['endUser'];
}): Promise<void> {
    const logCtx = activityLogId && team ? logContextGetter.get({ id: activityLogId, accountId: team.id }) : null;

    if (team && environment) {
        if (logCtx) {
            try {
                void slackService.reportFailure({
                    account: team,
                    environment,
                    connection,
                    name: syncVariant === 'base' ? syncName : `${syncName}::${syncVariant}`,
                    type: 'sync',
                    originalActivityLogId: logCtx.id,
                    provider
                });
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
        }
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
            syncVariant: syncVariant || 'base',
            content: error.message,
            runTimeInSeconds: runTime,
            createdAt: Date.now(),
            internalIntegrationId: syncConfig?.nango_config_id || null,
            endUser
        });
    }

    if (team) {
        logCtx?.attachSpan(
            new OtlpSpan(
                getFormattedOperation(
                    { operation: { type: 'sync', action: 'run' } },
                    {
                        account: team,
                        environment: environment,
                        integration: providerConfig
                            ? { id: providerConfig.id!, name: providerConfig?.unique_key, provider: providerConfig.provider }
                            : undefined,
                        connection: { id: connection.id, name: connection.connection_id },
                        syncConfig: syncConfig ? { id: syncConfig.id, name: syncName } : undefined,
                        meta: syncConfig ? { scriptVersion: syncConfig.version } : undefined
                    }
                ),
                new Date(startedAt)
            )
        );
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
                        syncVariant,
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
                        operation: lastSyncDate ? SyncJobsType.INCREMENTAL : SyncJobsType.FULL
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

    void logCtx?.error(error.message, { error });
    await logCtx?.enrichOperation({ error });
    if (isCancel) {
        await logCtx?.cancel();
    } else {
        await logCtx?.failed();
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

    if (logCtx) {
        await errorNotificationService.sync.create({
            action: 'run',
            type: 'sync',
            sync_id: syncId,
            connection_id: connection.id,
            log_id: logCtx.id,
            active: true
        });
    }

    metrics.increment(metrics.Types.SYNC_FAILURE);
    metrics.duration(metrics.Types.SYNC_TRACK_RUNTIME, Date.now() - startedAt.getTime());
}
