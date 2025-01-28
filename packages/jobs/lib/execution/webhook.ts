import tracer from 'dd-trace';
import { Err, Ok, metrics } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { TaskWebhook } from '@nangohq/nango-orchestrator';
import type { Config, Job, NangoConnection, Sync } from '@nangohq/shared';
import {
    NangoError,
    SyncStatus,
    SyncType,
    configService,
    createSyncJob,
    environmentService,
    externalWebhookService,
    featureFlags,
    getApiUrl,
    getEndUserByConnectionId,
    getSyncByIdAndName,
    getSyncConfigRaw,
    updateSyncJobStatus
} from '@nangohq/shared';
import { bigQueryClient } from '../clients.js';
import { logContextGetter } from '@nangohq/logs';
import type { DBEnvironment, DBSyncConfig, DBTeam, NangoProps } from '@nangohq/types';
import { startScript } from './operations/start.js';
import { sendSync as sendSyncWebhook } from '@nangohq/webhooks';
import db from '@nangohq/database';
import { getRunnerFlags } from '../utils/flags.js';

export async function startWebhook(task: TaskWebhook): Promise<Result<void>> {
    let team: DBTeam | undefined;
    let environment: DBEnvironment | undefined;
    let providerConfig: Config | null = null;
    let sync: Sync | undefined | null;
    let syncJob: Pick<Job, 'id'> | null = null;
    let syncConfig: DBSyncConfig | null = null;
    let endUser: NangoProps['endUser'] | null = null;

    try {
        const accountAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: task.connection.environment_id });
        if (!accountAndEnv) {
            throw new Error(`Account and environment not found`);
        }
        team = accountAndEnv.account;
        environment = accountAndEnv.environment;

        providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
        if (providerConfig === null) {
            throw new Error(`Provider config not found for connection: ${task.connection.connection_id}`);
        }

        sync = await getSyncByIdAndName(task.connection.id, task.parentSyncName);
        if (!sync) {
            throw new Error(`Sync not found for connection: ${task.connection.connection_id}`);
        }

        syncConfig = await getSyncConfigRaw({
            environmentId: providerConfig.environment_id,
            config_id: providerConfig.id!,
            name: task.parentSyncName,
            isAction: false
        });
        if (!syncConfig) {
            throw new Error(`Webhook config not found: ${task.id}`);
        }

        const getEndUser = await getEndUserByConnectionId(db.knex, { connectionId: task.connection.id });
        if (getEndUser.isOk()) {
            endUser = { id: getEndUser.value.id, endUserId: getEndUser.value.endUserId, orgId: getEndUser.value.organization?.organizationId || null };
        }

        const logCtx = await logContextGetter.get({ id: String(task.activityLogId) });

        await logCtx.info(`Starting webhook '${task.webhookName}'`, {
            input: task.input,
            webhook: task.webhookName,
            connection: task.connection.connection_id,
            integration: task.connection.provider_config_key
        });

        syncJob = await createSyncJob({
            sync_id: sync.id,
            type: SyncType.INCREMENTAL,
            status: SyncStatus.RUNNING,
            job_id: task.name,
            nangoConnection: task.connection,
            sync_config_id: syncConfig.id,
            run_id: task.id,
            log_id: logCtx.id
        });
        if (!syncJob) {
            throw new Error(`Failed to create sync job for sync: ${sync.id}. TaskId: ${task.id}`);
        }

        const nangoProps: NangoProps = {
            scriptType: 'webhook',
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
            attributes: syncConfig.attributes,
            syncConfig: syncConfig,
            syncId: sync.id,
            syncJobId: syncJob.id,
            debug: false,
            runnerFlags: await getRunnerFlags(featureFlags),
            startedAt: new Date(),
            endUser
        };

        metrics.increment(metrics.Types.WEBHOOK_EXECUTION, 1, { accountId: team.id });

        const res = await startScript({
            taskId: task.id,
            nangoProps,
            logCtx: logCtx,
            input: task.input
        });

        if (res.isErr()) {
            throw res.error;
        }

        return Ok(undefined);
    } catch (err) {
        const error = new NangoError('webhook_script_failure', { error: err instanceof Error ? err.message : err });
        await onFailure({
            team,
            environment,
            connection: {
                id: task.connection.id,
                connection_id: task.connection.connection_id,
                environment_id: task.connection.environment_id,
                provider_config_key: task.connection.provider_config_key
            },
            syncId: sync?.id as string,
            syncName: task.parentSyncName,
            syncJobId: syncJob?.id,
            providerConfigKey: task.connection.provider_config_key,
            providerConfig,
            activityLogId: task.activityLogId,
            models: syncConfig?.models || [],
            runTime: 0,
            error,
            syncConfig,
            endUser
        });
        return Err(error);
    }
}

export async function handleWebhookSuccess({ nangoProps }: { nangoProps: NangoProps }): Promise<void> {
    const content = `The webhook "${nangoProps.syncConfig.sync_name}" has been run successfully.`;
    void bigQueryClient.insert({
        executionType: 'webhook',
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
        syncId: nangoProps.syncId!,
        content,
        runTimeInSeconds: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
        createdAt: Date.now(),
        internalIntegrationId: nangoProps.syncConfig.nango_config_id,
        endUser: nangoProps.endUser
    });

    const syncJob = await updateSyncJobStatus(nangoProps.syncJobId!, SyncStatus.SUCCESS);

    if (!syncJob) {
        throw new Error(`Failed to update sync job status to SUCCESS for sync job: ${nangoProps.syncJobId}`);
    }

    const providerConfig = await configService.getProviderConfig(nangoProps.providerConfigKey, nangoProps.environmentId);
    if (providerConfig === null) {
        throw new Error(`Provider config not found for connection: ${nangoProps.connectionId}`);
    }

    const webhookSettings = await externalWebhookService.get(nangoProps.environmentId);

    const accountAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: nangoProps.environmentId });
    if (!accountAndEnv) {
        throw new Error(`Account and environment not found`);
    }
    const team = accountAndEnv.account;
    const environment = accountAndEnv.environment;

    if (environment) {
        for (const model of nangoProps.syncConfig.models || []) {
            const span = tracer.startSpan('jobs.webhook.webhook', {
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
                    const res = await sendSyncWebhook({
                        account: team,
                        connection: {
                            id: nangoProps.nangoConnectionId!,
                            connection_id: nangoProps.connectionId,
                            environment_id: nangoProps.environmentId,
                            provider_config_key: nangoProps.providerConfigKey
                        },
                        environment: environment,
                        webhookSettings,
                        syncConfig: nangoProps.syncConfig,
                        providerConfig,
                        model,
                        now: nangoProps.startedAt,
                        success: true,
                        responseResults: syncJob.result?.[model] || { added: 0, updated: 0, deleted: 0 },
                        operation: 'WEBHOOK'
                    });

                    if (res.isErr()) {
                        throw new Error(`Failed to send webhook for webhook: ${nangoProps.syncConfig.sync_name}`);
                    }
                } catch (err) {
                    span?.setTag('error', err);
                } finally {
                    span.finish();
                }
            });
        }
    }
}

export async function handleWebhookError({ nangoProps, error }: { nangoProps: NangoProps; error: NangoError }): Promise<void> {
    let team: DBTeam | undefined;
    let environment: DBEnvironment | undefined;
    const accountAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: nangoProps.environmentId });
    if (accountAndEnv) {
        team = accountAndEnv.account;
        environment = accountAndEnv.environment;
    }

    const providerConfig = await configService.getProviderConfig(nangoProps.providerConfigKey, nangoProps.environmentId);
    if (providerConfig === null) {
        throw new Error(`Provider config not found for connection: ${nangoProps.connectionId}`);
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
        syncId: nangoProps.syncId!,
        syncName: nangoProps.syncConfig.sync_name,
        syncJobId: nangoProps.syncJobId!,
        providerConfigKey: nangoProps.providerConfigKey,
        providerConfig,
        activityLogId: nangoProps.activityLogId || 'unknown',
        models: nangoProps.syncConfig.models || [],
        runTime: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
        error,
        syncConfig: nangoProps.syncConfig,
        endUser: nangoProps.endUser
    });
}

async function onFailure({
    connection,
    team,
    environment,
    syncId,
    syncName,
    syncJobId,
    syncConfig,
    providerConfig,
    providerConfigKey,
    models,
    runTime,
    error,
    endUser
}: {
    connection: NangoConnection;
    team: DBTeam | undefined;
    environment: DBEnvironment | undefined;
    syncId: string;
    syncJobId?: number | undefined;
    syncName: string;
    syncConfig: DBSyncConfig | null;
    providerConfig: Config | null;
    providerConfigKey: string;
    models: string[];
    activityLogId: string;
    runTime: number;
    error: NangoError;
    endUser: NangoProps['endUser'];
}): Promise<void> {
    if (team && environment) {
        void bigQueryClient.insert({
            executionType: 'webhook',
            connectionId: connection.connection_id,
            internalConnectionId: connection.id,
            accountId: team.id,
            accountName: team.name,
            scriptName: syncName,
            scriptType: 'webhook',
            environmentId: environment.id,
            environmentName: environment.name,
            providerConfigKey: providerConfigKey,
            status: 'failed',
            syncId: syncId,
            content: error.message,
            runTimeInSeconds: runTime,
            createdAt: Date.now(),
            internalIntegrationId: syncConfig?.nango_config_id || null,
            endUser
        });
    }

    if (syncJobId) {
        await updateSyncJobStatus(syncJobId, SyncStatus.STOPPED);
    }
    if (environment) {
        const webhookSettings = await externalWebhookService.get(environment.id);
        if (webhookSettings) {
            const span = tracer.startSpan('jobs.webhook.webhook', {
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
                            environment,
                            connection: connection,
                            webhookSettings,
                            syncConfig,
                            providerConfig,
                            model: models.join(','),
                            success: false,
                            error: {
                                type: 'script_error',
                                description: error.message
                            },
                            now: new Date(),
                            operation: 'WEBHOOK'
                        });

                        if (res.isErr()) {
                            throw new Error(`Failed to send webhook for webhook: ${syncName}`);
                        }
                    } catch (err) {
                        span?.setTag('error', err);
                    } finally {
                        span.finish();
                    }
                });
            }
        }
    }
}
