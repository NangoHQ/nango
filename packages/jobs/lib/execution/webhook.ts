import { Err, Ok, metrics } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { TaskWebhook } from '@nangohq/nango-orchestrator';
import type { Config, Job, NangoConnection, NangoProps, Sync } from '@nangohq/shared';
import {
    NangoError,
    SyncStatus,
    SyncType,
    configService,
    createSyncJob,
    environmentService,
    getApiUrl,
    getRunnerFlags,
    getSyncByIdAndName,
    getSyncConfigRaw,
    updateSyncJobStatus
} from '@nangohq/shared';
import { bigQueryClient } from '../clients.js';
import { logContextGetter } from '@nangohq/logs';
import type { DBEnvironment, DBTeam } from '@nangohq/types';
import { startScript } from './operations/start.js';

export async function startWebhook(task: TaskWebhook): Promise<Result<void>> {
    let account: DBTeam | undefined;
    let environment: DBEnvironment | undefined;
    let providerConfig: Config | undefined | null;
    let sync: Sync | undefined | null;
    let syncJob: Pick<Job, 'id'> | null = null;

    try {
        const accountAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: task.connection.environment_id });
        if (!accountAndEnv) {
            throw new Error(`Account and environment not found`);
        }
        account = accountAndEnv.account;
        environment = accountAndEnv.environment;

        providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
        if (providerConfig === null) {
            throw new Error(`Provider config not found for connection: ${task.connection.connection_id}`);
        }

        sync = await getSyncByIdAndName(task.connection.id, task.parentSyncName);
        if (!sync) {
            throw new Error(`Sync not found for connection: ${task.connection.connection_id}`);
        }

        const syncConfig = await getSyncConfigRaw({
            environmentId: providerConfig.environment_id,
            config_id: providerConfig.id!,
            name: task.parentSyncName,
            isAction: false
        });
        if (!syncConfig) {
            throw new Error(`Webhook config not found: ${task.id}`);
        }

        const logCtx = await logContextGetter.get({ id: String(task.activityLogId) });

        syncJob = await createSyncJob({
            sync_id: sync.id,
            type: SyncType.INCREMENTAL,
            status: SyncStatus.RUNNING,
            job_id: task.name,
            nangoConnection: task.connection,
            sync_config_id: syncConfig.id!,
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
                id: account.id,
                name: account.name
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
            runnerFlags: await getRunnerFlags(),
            startedAt: new Date()
        };

        metrics.increment(metrics.Types.WEBHOOK_EXECUTION, 1, { accountId: account.id });

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
            activityLogId: task.activityLogId,
            runTime: 0,
            error,
            environment: { id: task.connection.environment_id, name: environment?.name || 'unknown' },
            ...(account?.id && account?.name ? { team: { id: account.id, name: account.name } } : {})
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
        createdAt: Date.now()
    });
    const logCtx = await logContextGetter.get({ id: String(nangoProps.activityLogId) });
    await logCtx.info(content);

    await updateSyncJobStatus(nangoProps.syncJobId!, SyncStatus.SUCCESS);
}

export async function handleWebhookError({ nangoProps, error }: { nangoProps: NangoProps; error: NangoError }): Promise<void> {
    await onFailure({
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
        activityLogId: nangoProps.activityLogId!,
        runTime: (new Date().getTime() - nangoProps.startedAt.getTime()) / 1000,
        error,
        environment: { id: nangoProps.environmentId, name: nangoProps.environmentName || 'unknown' },
        ...(nangoProps.team ? { team: { id: nangoProps.team.id, name: nangoProps.team.name } } : {})
    });
}

async function onFailure({
    connection,
    team,
    environment,
    syncId,
    syncName,
    syncJobId,
    providerConfigKey,
    activityLogId,
    runTime,
    error
}: {
    connection: NangoConnection;
    team?: { id: number; name: string };
    environment: { id: number; name: string };
    syncId: string;
    syncJobId?: number | undefined;
    syncName: string;
    providerConfigKey: string;
    activityLogId: string;
    runTime: number;
    error: NangoError;
}): Promise<void> {
    if (team) {
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
            createdAt: Date.now()
        });
    }
    const logCtx = await logContextGetter.get({ id: activityLogId });
    await logCtx.error(error.message, { error });

    if (syncJobId) {
        await updateSyncJobStatus(syncJobId, SyncStatus.STOPPED);
    }
}
