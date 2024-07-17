import tracer from 'dd-trace';
import type { OrchestratorTask, TaskWebhook, TaskAction, TaskPostConnection, TaskSync } from '@nangohq/nango-orchestrator';
import { Err, Ok, metrics, stringifyError } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { Job, SyncConfig } from '@nangohq/shared';
import {
    configService,
    createSyncJob,
    environmentService,
    errorManager,
    ErrorSourceEnum,
    getLastSyncDate,
    getSyncByIdAndName,
    getSyncConfigRaw,
    SyncStatus,
    SyncType,
    updateSyncJobStatus
} from '@nangohq/shared';
import type { LogContext } from '@nangohq/logs';
import { logContextGetter } from '@nangohq/logs';
import { cancelScript } from '../scripts/operations/cancel.js';
import { startSync } from '../scripts/sync.js';
import { startAction } from '../scripts/action.js';
import { startWebhook } from '../scripts/webhook.js';
import { startPostConnection } from '../scripts/postConnection.js';

export async function handler(task: OrchestratorTask): Promise<Result<void>> {
    task.abortController.signal.onabort = () => {
        abort(task);
    };
    if (task.isSync()) {
        const span = tracer.startSpan('jobs.handler.sync');
        return await tracer.scope().activate(span, async () => {
            const start = Date.now();
            const res = await syncHandler(task);
            if (res.isErr()) {
                metrics.increment(metrics.Types.SYNC_FAILURE);
            } else {
                metrics.increment(metrics.Types.SYNC_SUCCESS);
                metrics.duration(metrics.Types.SYNC_TRACK_RUNTIME, Date.now() - start);
            }
            span.finish();
            return res;
        });
    }
    if (task.isAction()) {
        const span = tracer.startSpan('jobs.handler.action');
        return await tracer.scope().activate(span, async () => {
            const res = await actionHandler(task);
            span.finish();
            return res;
        });
    }
    if (task.isWebhook()) {
        const span = tracer.startSpan('jobs.handler.webhook');
        return await tracer.scope().activate(span, async () => {
            const res = webhookHandler(task);
            span.finish();
            return res;
        });
    }
    if (task.isPostConnection()) {
        const span = tracer.startSpan('jobs.handler.postConnection');
        return await tracer.scope().activate(span, async () => {
            const res = postConnectionHandler(task);
            span.finish();
            return res;
        });
    }
    return Err(`Unreachable`);
}

async function abort(task: OrchestratorTask): Promise<Result<void>> {
    try {
        if (task.isSync()) {
            await cancelScript({ taskId: task.id });
            return Ok(undefined);
        }
        return Err(`Failed to cancel. Task type not supported`);
    } catch (err) {
        return Err(`Failed to cancel: ${stringifyError(err)}`);
    }
}

async function syncHandler(task: TaskSync): Promise<Result<void>> {
    let logCtx: LogContext | undefined;
    let syncJob: Pick<Job, 'id'> | null = null;
    let lastSyncDate: Date | null = null;
    let syncType: SyncType = SyncType.FULL;
    try {
        lastSyncDate = await getLastSyncDate(task.syncId);
        const providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
        if (providerConfig === null) {
            return Err(`Provider config not found for connection: ${task.connection}. TaskId: ${task.id}`);
        }

        syncType = lastSyncDate ? SyncType.INCREMENTAL : SyncType.FULL;
        syncJob = await createSyncJob(task.syncId, syncType, SyncStatus.RUNNING, task.name, task.connection, task.id);
        if (!syncJob) {
            return Err(`Failed to create sync job for sync: ${task.syncId}. TaskId: ${task.id}`);
        }

        const syncConfig = await getSyncConfigRaw({
            environmentId: providerConfig.environment_id,
            config_id: providerConfig.id!,
            name: task.syncName,
            isAction: false
        });

        if (!syncConfig) {
            return Err(`Sync config not found. TaskId: ${task.id}`);
        }

        const accountAndEnv = await environmentService.getAccountAndEnvironment({ environmentId: task.connection.environment_id });
        if (!accountAndEnv) {
            return Err(`Account and environment not found. TaskId: ${task.id}`);
        }
        const { account, environment } = accountAndEnv;

        logCtx = await logContextGetter.create(
            { operation: { type: 'sync', action: 'run' }, message: 'Sync' },
            {
                account,
                environment,
                integration: { id: providerConfig.id!, name: providerConfig.unique_key, provider: providerConfig.provider },
                connection: { id: task.connection.id, name: task.connection.connection_id },
                syncConfig: { id: syncConfig.id!, name: syncConfig.sync_name }
            }
        );

        if (task.debug) {
            await logCtx.info('Starting sync', {
                syncType: syncType,
                syncName: task.syncName,
                syncId: task.syncId,
                syncJobId: syncJob.id,
                attempt: task.attempt,
                executionId: task.id
            });
        }

        return startSync({
            scriptType: 'sync',
            taskId: task.id,
            syncConfig,
            syncId: task.syncId,
            syncJobId: syncJob.id,
            nangoConnection: task.connection,
            provider: providerConfig.provider,
            syncType: syncType,
            debug: task.debug,
            logCtx
        });
    } catch (err) {
        const prettyError = stringifyError(err, { pretty: true });
        const content = `The ${syncType || ''} sync failed to start: ${prettyError}`;
        if (logCtx) {
            await logCtx.error(content, { error: err });
            await logCtx.failed();
        }

        errorManager.report(content, {
            environmentId: task.connection.environment_id,
            source: ErrorSourceEnum.PLATFORM,
            operation: syncType,
            metadata: {
                connectionId: task.connection.connection_id,
                providerConfigKey: task.connection.provider_config_key,
                syncType,
                syncName: task.syncName
            }
        });

        if (syncJob) {
            await updateSyncJobStatus(syncJob.id, SyncStatus.ERROR);
        }

        return Err(`Failed sync run: ${prettyError}. TaskId: ${task.id}`);
    }
}

async function actionHandler(task: TaskAction): Promise<Result<void>> {
    const providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
    if (providerConfig === null) {
        return Err(`Provider config not found for connection: ${task.connection.connection_id}`);
    }

    const syncConfig = await getSyncConfigRaw({
        environmentId: providerConfig.environment_id,
        config_id: providerConfig.id!,
        name: task.actionName,
        isAction: true
    });
    if (!syncConfig) {
        return Err(`Action config not found: ${task.id}`);
    }

    return startAction({
        taskId: task.id,
        scriptType: 'action',
        syncConfig,
        nangoConnection: task.connection,
        provider: providerConfig.provider,
        input: task.input,
        logCtx: await logContextGetter.get({ id: String(task.activityLogId) })
    });
}

async function webhookHandler(task: TaskWebhook): Promise<Result<void>> {
    const providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
    if (providerConfig === null) {
        return Err(`Provider config not found for connection: ${task.connection.connection_id}`);
    }

    const sync = await getSyncByIdAndName(task.connection.id, task.parentSyncName);
    if (!sync) {
        return Err(`Sync not found for connection: ${task.connection.connection_id}`);
    }

    const syncConfig = await getSyncConfigRaw({
        environmentId: providerConfig.environment_id,
        config_id: providerConfig.id!,
        name: task.parentSyncName,
        isAction: false
    });
    if (!syncConfig) {
        return Err(`Action config not found. TaskId: ${task.id}`);
    }

    const syncJob = await createSyncJob(sync.id, SyncType.WEBHOOK, SyncStatus.RUNNING, task.name, task.connection, task.id);
    if (!syncJob) {
        return Err(`Failed to create sync job for webhook: ${task.webhookName}. TaskId: ${task.id}`);
    }

    return startWebhook({
        taskId: task.id,
        scriptType: 'webhook',
        syncConfig,
        nangoConnection: task.connection,
        provider: providerConfig.provider,
        logCtx: await logContextGetter.get({ id: String(task.activityLogId) })
    });
}

async function postConnectionHandler(task: TaskPostConnection): Promise<Result<void>> {
    const providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
    if (providerConfig === null) {
        return Err(`Provider config not found for connection: ${task.connection.connection_id}`);
    }

    const now = new Date();
    const syncConfig: SyncConfig = {
        sync_name: task.postConnectionName,
        file_location: task.fileLocation,
        models: [],
        track_deletes: false,
        type: 'sync',
        version: task.version,
        active: true,
        auto_start: false,
        enabled: true,
        environment_id: task.connection.environment_id,
        model_schema: [],
        nango_config_id: -1,
        runs: '',
        webhook_subscriptions: [],
        created_at: now,
        updated_at: now
    };

    return startPostConnection({
        taskId: task.id,
        scriptType: 'post-connection-script',
        syncConfig,
        nangoConnection: task.connection,
        provider: providerConfig.provider,
        logCtx: await logContextGetter.get({ id: String(task.activityLogId) })
    });
}
