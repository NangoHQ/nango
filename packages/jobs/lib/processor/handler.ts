import tracer from 'dd-trace';
import type { OrchestratorTask } from '@nangohq/nango-orchestrator';
import { Err, metrics } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { startSync, abortSync } from '../scripts/sync.js';
import { startAction } from '../scripts/action.js';
import { startWebhook } from '../scripts/webhook.js';
import { startPostConnection } from '../scripts/postConnection.js';

export async function handler(task: OrchestratorTask): Promise<Result<void>> {
    if (task.isSync()) {
        const span = tracer.startSpan('jobs.handler.sync');
        return await tracer.scope().activate(span, async () => {
            const start = Date.now();
            const res = await startSync(task);
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
    if (task.isSyncAbort()) {
        const span = tracer.startSpan('jobs.handler.abort');
        return await tracer.scope().activate(span, async () => {
            const res = await abortSync(task);
            span.finish();
            return res;
        });
    }
    if (task.isAction()) {
        const span = tracer.startSpan('jobs.handler.action');
        return await tracer.scope().activate(span, async () => {
            const res = await startAction(task);
            span.finish();
            return res;
        });
    }
    if (task.isWebhook()) {
        const span = tracer.startSpan('jobs.handler.webhook');
        return await tracer.scope().activate(span, async () => {
            const res = startWebhook(task);
            span.finish();
            return res;
        });
    }
    if (task.isPostConnection()) {
        const span = tracer.startSpan('jobs.handler.postConnection');
        return await tracer.scope().activate(span, async () => {
            const res = startPostConnection(task);
            span.finish();
            return res;
        });
    }
    return Err(`Unreachable`);
}

// async function cancelHandler(task: OrchestratorTask): Promise<Result<void>> {
//     try {
//         if (task.isSyncCancel()) {
//             await cancelScript({ taskId: task.id });
//             return Ok(undefined);
//         }
//         return Err(`Failed to cancel task '${task.id}'. Task type not supported`);
//     } catch (err) {
//         return Err(`Failed to cancel: ${stringifyError(err)}`);
//     }
// }
//
// async function actionHandler(task: TaskAction): Promise<Result<void>> {
//     const providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
//     if (providerConfig === null) {
//         return Err(`Provider config not found for connection: ${task.connection.connection_id}`);
//     }
//
//     const syncConfig = await getSyncConfigRaw({
//         environmentId: providerConfig.environment_id,
//         config_id: providerConfig.id!,
//         name: task.actionName,
//         isAction: true
//     });
//     if (!syncConfig) {
//         return Err(`Action config not found: ${task.id}`);
//     }
//
//     return startAction({
//         taskId: task.id,
//         scriptType: 'action',
//         syncConfig,
//         nangoConnection: task.connection,
//         provider: providerConfig.provider,
//         input: task.input,
//         logCtx: await logContextGetter.get({ id: String(task.activityLogId) })
//     });
// }
//
// async function webhookHandler(task: TaskWebhook): Promise<Result<void>> {
//     const providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
//     if (providerConfig === null) {
//         return Err(`Provider config not found for connection: ${task.connection.connection_id}`);
//     }
//
//     const sync = await getSyncByIdAndName(task.connection.id, task.parentSyncName);
//     if (!sync) {
//         return Err(`Sync not found for connection: ${task.connection.connection_id}`);
//     }
//
//     const syncConfig = await getSyncConfigRaw({
//         environmentId: providerConfig.environment_id,
//         config_id: providerConfig.id!,
//         name: task.parentSyncName,
//         isAction: false
//     });
//     if (!syncConfig) {
//         return Err(`Action config not found. TaskId: ${task.id}`);
//     }
//
//     const syncJob = await createSyncJob(sync.id, SyncType.WEBHOOK, SyncStatus.RUNNING, task.name, task.connection, task.id);
//     if (!syncJob) {
//         return Err(`Failed to create sync job for webhook: ${task.webhookName}. TaskId: ${task.id}`);
//     }
//
//     return startWebhook({
//         taskId: task.id,
//         scriptType: 'webhook',
//         syncConfig,
//         nangoConnection: task.connection,
//         provider: providerConfig.provider,
//         logCtx: await logContextGetter.get({ id: String(task.activityLogId) })
//     });
// }
//
// async function postConnectionHandler(task: TaskPostConnection): Promise<Result<void>> {
//     const providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
//     if (providerConfig === null) {
//         return Err(`Provider config not found for connection: ${task.connection.connection_id}`);
//     }
//
//     const now = new Date();
//     const syncConfig: SyncConfig = {
//         sync_name: task.postConnectionName,
//         file_location: task.fileLocation,
//         models: [],
//         track_deletes: false,
//         type: 'sync',
//         version: task.version,
//         active: true,
//         auto_start: false,
//         enabled: true,
//         environment_id: task.connection.environment_id,
//         model_schema: [],
//         nango_config_id: -1,
//         runs: '',
//         webhook_subscriptions: [],
//         created_at: now,
//         updated_at: now
//     };
//
//     return startPostConnection({
//         taskId: task.id,
//         scriptType: 'post-connection-script',
//         syncConfig,
//         nangoConnection: task.connection,
//         provider: providerConfig.provider,
//         logCtx: await logContextGetter.get({ id: String(task.activityLogId) })
//     });
// }
