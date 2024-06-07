import type { OrchestratorTask, TaskWebhook, TaskAction, TaskPostConnection, TaskSync } from '@nangohq/nango-orchestrator';
import { jsonSchema } from '@nangohq/nango-orchestrator';
import type { JsonValue } from 'type-fest';
import { Err, Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { configService, createSyncJob, getSyncByIdAndName, syncRunService, SyncStatus, SyncType } from '@nangohq/shared';
import { sendSync } from '@nangohq/webhooks';
import { logContextGetter } from '@nangohq/logs';
import { records as recordsService } from '@nangohq/records';
import integrationService from '../integration.service.js';
import { bigQueryClient, slackService } from '../clients.js';

export async function handler(task: OrchestratorTask): Promise<Result<JsonValue>> {
    task.abortController.signal.onabort = () => {
        abort(task);
    };
    if (task.isSync()) {
        return sync(task);
    }
    if (task.isAction()) {
        return action(task);
    }
    if (task.isWebhook()) {
        return webhook(task);
    }
    if (task.isPostConnection()) {
        return postConnection(task);
    }
    return Err(`Unreachable`);
}

async function abort(_task: OrchestratorTask): Promise<Result<void>> {
    // TODO: Implement abort processing
    return Ok(undefined);
}

async function sync(task: TaskSync): Promise<Result<JsonValue>> {
    return Err(`Not implemented: ${JSON.stringify({ taskId: task.id })}`);
}

async function action(task: TaskAction): Promise<Result<JsonValue>> {
    const providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
    if (providerConfig === null) {
        return Err(`Provider config not found for connection: ${task.connection}`);
    }

    const syncRun = new syncRunService({
        bigQueryClient,
        integrationService,
        recordsService,
        slackService,
        writeToDb: true,
        sendSyncWebhook: sendSync,
        logCtx: await logContextGetter.get({ id: String(task.activityLogId) }),
        nangoConnection: task.connection,
        syncName: task.actionName,
        isAction: true,
        syncType: SyncType.ACTION,
        activityLogId: task.activityLogId,
        input: task.input as object, // TODO: fix type after temporal is removed
        provider: providerConfig.provider,
        debug: false
    });

    const { error, response } = await syncRun.run();
    if (error) {
        return Err(error);
    }
    const res = jsonSchema.safeParse(response);
    if (!res.success) {
        return Err(`Invalid action response format: ${response}. TaskId: ${task.id}`);
    }
    return Ok(res.data);
}

async function webhook(task: TaskWebhook): Promise<Result<JsonValue>> {
    const providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
    if (providerConfig === null) {
        return Err(`Provider config not found for connection: ${task.connection}`);
    }

    const sync = await getSyncByIdAndName(task.connection.id, task.parentSyncName);
    if (!sync) {
        return Err(`Sync not found for connection: ${task.connection}`);
    }

    const syncJobId = await createSyncJob(sync.id, SyncType.WEBHOOK, SyncStatus.RUNNING, task.name, task.connection, task.id);

    const syncRun = new syncRunService({
        bigQueryClient,
        integrationService,
        recordsService,
        slackService,
        writeToDb: true,
        sendSyncWebhook: sendSync,
        nangoConnection: task.connection,
        syncJobId: syncJobId?.id as number,
        syncName: task.parentSyncName,
        isAction: false,
        syncType: SyncType.WEBHOOK,
        syncId: sync?.id,
        isWebhook: true,
        activityLogId: task.activityLogId,
        logCtx: await logContextGetter.get({ id: String(task.activityLogId) }),
        input: task.input as object, // TODO: fix type after temporal is removed
        provider: providerConfig.provider,
        debug: false
    });
    const { error, response } = await syncRun.run();
    if (error) {
        return Err(error);
    }
    const res = jsonSchema.safeParse(response);
    if (!res.success) {
        return Err(`Invalid webhook response format: ${response}. TaskId: ${task.id}`);
    }
    return Ok(res.data);
}

async function postConnection(task: TaskPostConnection): Promise<Result<JsonValue>> {
    return Err(`Not implemented: ${JSON.stringify({ taskId: task.id })}`);
}
