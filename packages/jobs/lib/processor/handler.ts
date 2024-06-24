import type { OrchestratorTask, TaskWebhook, TaskAction, TaskPostConnection, TaskSync } from '@nangohq/nango-orchestrator';
import { jsonSchema } from '@nangohq/nango-orchestrator';
import type { JsonValue } from 'type-fest';
import { Err, Ok, stringifyError } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { LogLevel } from '@nangohq/shared';
import {
    configService,
    createActivityLog,
    createActivityLogAndLogMessage,
    createActivityLogMessage,
    createSyncJob,
    environmentService,
    errorManager,
    ErrorSourceEnum,
    featureFlags,
    getLastSyncDate,
    getSyncByIdAndName,
    getSyncConfigRaw,
    LogActionEnum,
    SyncRunService,
    SyncStatus,
    SyncType,
    updateSyncJobStatus
} from '@nangohq/shared';
import { sendSync } from '@nangohq/webhooks';
import type { LogContext } from '@nangohq/logs';
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

async function abort(task: OrchestratorTask): Promise<Result<void>> {
    try {
        if (task.isSync()) {
            await integrationService.cancelScript(task.syncId, task.connection.environment_id);
            return Ok(undefined);
        }
        return Err(`Failed to cancel. Task type not supported`);
    } catch (err) {
        return Err(`Failed to cancel: ${stringifyError(err)}`);
    }
}

async function sync(task: TaskSync): Promise<Result<JsonValue>> {
    const isGloballyEnabled = await featureFlags.isEnabled('orchestrator:schedule', 'global', false);
    const isEnvEnabled = await featureFlags.isEnabled('orchestrator:schedule', `${task.connection.environment_id}`, false);
    const isOrchestrator = isGloballyEnabled || isEnvEnabled;
    if (!isOrchestrator) {
        return Ok({ dryrun: true });
    }
    let logCtx: LogContext | undefined;
    const lastSyncDate = await getLastSyncDate(task.syncId);
    const providerConfig = await configService.getProviderConfig(task.connection.provider_config_key, task.connection.environment_id);
    if (providerConfig === null) {
        return Err(`Provider config not found for connection: ${task.connection.connection_id}. TaskId: ${task.id}`);
    }
    const syncType = lastSyncDate ? SyncType.INCREMENTAL : SyncType.FULL;
    const syncJob = await createSyncJob(task.syncId, syncType, SyncStatus.RUNNING, task.name, task.connection, task.id);
    if (!syncJob) {
        return Err(`Failed to create sync job for sync: ${task.syncId}. TaskId: ${task.id}`);
    }
    try {
        const log = {
            level: 'info' as LogLevel,
            success: null,
            action: lastSyncDate ? LogActionEnum.FULL_SYNC : LogActionEnum.SYNC,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: task.connection.connection_id,
            provider_config_key: task.connection.provider_config_key,
            provider: providerConfig.provider,
            session_id: syncJob.id.toString(),
            environment_id: task.connection.environment_id,
            operation_name: task.syncName
        };
        const activityLogId = await createActivityLog(log);
        if (activityLogId === null) {
            return Err(`Failed to create activity log. TaskId: ${task.id}`);
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
            { id: String(activityLogId), operation: { type: 'sync', action: 'run' }, message: 'Sync' },
            {
                account,
                environment,
                integration: { id: providerConfig.id!, name: providerConfig.unique_key, provider: providerConfig.provider },
                connection: { id: task.connection.id, name: task.connection.connection_id },
                syncConfig: { id: syncConfig.id!, name: syncConfig.sync_name }
            }
        );

        if (task.debug) {
            await createActivityLogMessage({
                level: 'info',
                environment_id: task.connection.environment_id,
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content: `Starting sync ${syncType} for ${task.syncName} with syncId ${task.syncId} and syncJobId ${syncJob.id} with execution id ${task.id} and attempt ${task.attempt}`
            });
            await logCtx.info('Starting sync', {
                syncType: syncType,
                syncName: task.syncName,
                syncId: task.syncId,
                syncJobId: syncJob.id,
                attempt: task.attempt,
                executionId: task.id
            });
        }

        const syncRun = new SyncRunService({
            bigQueryClient,
            integrationService,
            recordsService,
            slackService,
            sendSyncWebhook: sendSync,
            writeToDb: true,
            syncId: task.syncId,
            syncJobId: syncJob.id,
            nangoConnection: task.connection,
            syncConfig,
            syncType: syncType,
            activityLogId,
            provider: providerConfig.provider,
            debug: task.debug,
            logCtx
        });

        const { success, error, response } = await syncRun.run();
        if (!success) {
            return Err(`Sync failed with error ${error}. TaskId: ${task.id}`);
        }
        const res = jsonSchema.safeParse(response);
        if (!res.success) {
            return Err(`Invalid sync response format: ${response}. TaskId: ${task.id}`);
        }
        await updateSyncJobStatus(syncJob.id, SyncStatus.SUCCESS);
        return Ok(res.data);
    } catch (err) {
        const prettyError = stringifyError(err, { pretty: true });
        const log = {
            level: 'info' as LogLevel,
            success: false,
            action: lastSyncDate ? LogActionEnum.FULL_SYNC : LogActionEnum.SYNC,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: task.connection.connection_id,
            provider_config_key: task.connection.provider_config_key,
            provider: providerConfig.provider,
            session_id: syncJob.id.toString(),
            environment_id: task.connection.environment_id,
            operation_name: task.syncName
        };
        const content = `The ${syncType} sync failed to run: ${prettyError}`;

        await createActivityLogAndLogMessage(log, {
            level: 'error',
            environment_id: task.connection.environment_id,
            timestamp: Date.now(),
            content
        });
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

        await updateSyncJobStatus(syncJob.id, SyncStatus.ERROR);
        return Err(`Failed sync run: ${prettyError}. TaskId: ${task.id}`);
    }
}

async function action(task: TaskAction): Promise<Result<JsonValue>> {
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

    const syncRun = new SyncRunService({
        bigQueryClient,
        integrationService,
        recordsService,
        slackService,
        writeToDb: true,
        sendSyncWebhook: sendSync,
        logCtx: await logContextGetter.get({ id: String(task.activityLogId) }),
        nangoConnection: task.connection,
        syncConfig,
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

    const syncJobId = await createSyncJob(sync.id, SyncType.WEBHOOK, SyncStatus.RUNNING, task.name, task.connection, task.id);

    const syncRun = new SyncRunService({
        bigQueryClient,
        integrationService,
        recordsService,
        slackService,
        writeToDb: true,
        sendSyncWebhook: sendSync,
        nangoConnection: task.connection,
        syncConfig,
        syncJobId: syncJobId?.id as number,
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
        return Err(`Invalid webhook response format: ${JSON.stringify(response)}. TaskId: ${task.id}`);
    }
    return Ok(res.data);
}

async function postConnection(task: TaskPostConnection): Promise<Result<JsonValue>> {
    return Promise.resolve(Err(`Not implemented: TaskId: ${task.id}`));
}
