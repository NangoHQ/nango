import ms from 'ms';
import type { StringValue } from 'ms';
import type { LogContext, LogContextGetter } from '@nangohq/logs';
import { Err, Ok, stringifyError, metrics } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { NangoError } from '../utils/error.js';
import telemetry, { LogTypes } from '../utils/telemetry.js';
import type { RunnerOutput } from '../models/Runner.js';
import type { NangoConnection, Connection as NangoFullConnection } from '../models/Connection.js';
import {
    createActivityLog,
    createActivityLogMessage,
    createActivityLogMessageAndEnd,
    updateSuccess as updateSuccessActivityLog
} from '../services/activity/activity.service.js';
import { SYNC_TASK_QUEUE, WEBHOOK_TASK_QUEUE } from '../constants.js';
import { v4 as uuid } from 'uuid';
import featureFlags from '../utils/featureflags.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import type { Config as ProviderConfig } from '../models/Provider.js';
import type { LogLevel } from '@nangohq/types';
import SyncClient from './sync.client.js';
import type { Client as TemporalClient } from '@temporalio/client';
import { LogActionEnum } from '../models/Activity.js';
import type {
    ExecuteReturn,
    ExecuteActionProps,
    ExecuteWebhookProps,
    ExecutePostConnectionProps,
    ExecuteSyncProps,
    VoidReturn,
    OrchestratorTask
} from '@nangohq/nango-orchestrator';
import type { Account } from '../models/Admin.js';
import type { Environment } from '../models/Environment.js';
import type { SyncConfig } from '../models/index.js';
import { SyncCommand } from '../models/index.js';
import tracer from 'dd-trace';
import { clearLastSyncDate } from '../services/sync/sync.service.js';
import { isSyncJobRunning } from '../services/sync/job.service.js';
import { updateSyncScheduleFrequency } from '../services/sync/schedule.service.js';

async function getTemporal(): Promise<TemporalClient> {
    const instance = await SyncClient.getInstance();
    if (!instance) {
        throw new Error('Temporal client not initialized');
    }
    return instance.getClient() as TemporalClient;
}

export interface RecordsServiceInterface {
    deleteRecordsBySyncId({ syncId }: { syncId: string }): Promise<{ totalDeletedRecords: number }>;
}

export interface OrchestratorClientInterface {
    executeAction(props: ExecuteActionProps): Promise<ExecuteReturn>;
    executeWebhook(props: ExecuteWebhookProps): Promise<ExecuteReturn>;
    executePostConnection(props: ExecutePostConnectionProps): Promise<ExecuteReturn>;
    executeSync(props: ExecuteSyncProps): Promise<VoidReturn>;
    pauseSync({ scheduleName }: { scheduleName: string }): Promise<VoidReturn>;
    unpauseSync({ scheduleName }: { scheduleName: string }): Promise<VoidReturn>;
    deleteSync({ scheduleName }: { scheduleName: string }): Promise<VoidReturn>;
    updateSyncFrequency({ scheduleName, frequencyMs }: { scheduleName: string; frequencyMs: number }): Promise<VoidReturn>;
    cancel({ taskId, reason }: { taskId: string; reason: string }): Promise<Result<OrchestratorTask>>;
}

export class Orchestrator {
    private client: OrchestratorClientInterface;

    public constructor(client: OrchestratorClientInterface) {
        this.client = client;
    }

    private getScheduleName({ environmentId, syncId }: { environmentId: number; syncId: string }): string {
        return `environment:${environmentId}:sync:${syncId}`;
    }

    async triggerAction<T = any>({
        connection,
        actionName,
        input,
        activityLogId,
        environment_id,
        logCtx
    }: {
        connection: NangoConnection;
        actionName: string;
        input: object;
        activityLogId: number;
        environment_id: number;
        logCtx: LogContext;
    }): Promise<Result<T, NangoError>> {
        const startTime = Date.now();
        const workflowId = `${SYNC_TASK_QUEUE}.ACTION:${actionName}.${connection.connection_id}.${uuid()}`;
        try {
            await createActivityLogMessage({
                level: 'info',
                environment_id,
                activity_log_id: activityLogId,
                content: `Starting action workflow ${workflowId} in the task queue: ${SYNC_TASK_QUEUE}`,
                params: {
                    input: JSON.stringify(input, null, 2)
                },
                timestamp: Date.now()
            });
            await logCtx.info(`Starting action workflow ${workflowId} in the task queue: ${SYNC_TASK_QUEUE}`, { input });

            let res: Result<any, NangoError>;

            const isGloballyEnabled = await featureFlags.isEnabled('orchestrator:immediate', 'global', false);
            const isEnvEnabled = await featureFlags.isEnabled('orchestrator:immediate', `${environment_id}`, false);
            const activeSpan = tracer.scope().active();
            const spanTags = {
                'action.name': actionName,
                'connection.id': connection.id,
                'connection.connection_id': connection.connection_id,
                'connection.provider_config_key': connection.provider_config_key,
                'connection.environment_id': connection.environment_id
            };
            if (isGloballyEnabled || isEnvEnabled) {
                const span = tracer.startSpan('execute.action', {
                    tags: spanTags,
                    ...(activeSpan ? { childOf: activeSpan } : {})
                });
                try {
                    const groupKey: string = 'action';
                    const executionId = `${groupKey}:environment:${connection.environment_id}:connection:${connection.id}:action:${actionName}:at:${new Date().toISOString()}:${uuid()}`;
                    const parsedInput = input ? JSON.parse(JSON.stringify(input)) : null;
                    const args = {
                        actionName,
                        connection: {
                            id: connection.id!,
                            connection_id: connection.connection_id,
                            provider_config_key: connection.provider_config_key,
                            environment_id: connection.environment_id
                        },
                        activityLogId,
                        input: parsedInput
                    };
                    const actionResult = await this.client.executeAction({
                        name: executionId,
                        groupKey,
                        args
                    });

                    res = actionResult.mapError((e) => new NangoError('action_failure', { error: e.message, ...(e.payload ? { payload: e.payload } : {}) }));
                    if (res.isErr()) {
                        span.setTag('error', res.error);
                    }
                } catch (e: unknown) {
                    const errorMsg = `Execute: Failed to parse input '${JSON.stringify(input)}': ${stringifyError(e)}`;
                    const error = new NangoError('action_failure', { error: errorMsg });
                    span.setTag('error', e);
                    return Err(error);
                } finally {
                    span.finish();
                }
            } else {
                const span = tracer.startSpan('execute.actionTemporal', {
                    tags: spanTags,
                    ...(activeSpan ? { childOf: activeSpan } : {})
                });
                try {
                    const temporal = await getTemporal();
                    const actionHandler = await temporal.workflow.execute('action', {
                        taskQueue: SYNC_TASK_QUEUE,
                        workflowId,
                        args: [
                            {
                                actionName,
                                nangoConnection: {
                                    id: connection.id,
                                    connection_id: connection.connection_id,
                                    provider_config_key: connection.provider_config_key,
                                    environment_id: connection.environment_id
                                },
                                input,
                                activityLogId
                            }
                        ]
                    });

                    const { error: rawError, response }: RunnerOutput = actionHandler;
                    if (rawError) {
                        // Errors received from temporal are raw objects not classes
                        const error = new NangoError(rawError['type'], rawError['payload'], rawError['status']);
                        res = Err(error);
                        await logCtx.error(`Failed with error ${rawError['type']}`, { payload: rawError['payload'] });
                    } else {
                        res = Ok(response);
                    }
                    if (res.isErr()) {
                        span.setTag('error', res.error);
                    }
                } catch (e: unknown) {
                    span.setTag('error', e);
                    throw e;
                } finally {
                    span.finish();
                }
            }

            if (res.isErr()) {
                throw res.error;
            }

            const content = `The action workflow ${workflowId} was successfully run. A truncated response is: ${JSON.stringify(res.value, null, 2)?.slice(0, 100)}`;

            await createActivityLogMessageAndEnd({
                level: 'info',
                environment_id,
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content
            });
            await updateSuccessActivityLog(activityLogId, true);
            await logCtx.info(content);

            await telemetry.log(
                LogTypes.ACTION_SUCCESS,
                content,
                LogActionEnum.ACTION,
                {
                    workflowId,
                    input: JSON.stringify(input, null, 2),
                    connection: JSON.stringify(connection),
                    actionName
                },
                `actionName:${actionName}`
            );

            return res;
        } catch (err) {
            const errorMessage = stringifyError(err, { pretty: true });
            const error = new NangoError('action_failure', { errorMessage });

            const content = `The action workflow ${workflowId} failed with error: ${err}`;

            await createActivityLogMessageAndEnd({
                level: 'error',
                environment_id,
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content
            });
            await logCtx.error(content);

            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.SYNC_CLIENT,
                environmentId: connection.environment_id,
                metadata: {
                    actionName,
                    connectionDetails: JSON.stringify(connection),
                    input
                }
            });

            await telemetry.log(
                LogTypes.ACTION_FAILURE,
                content,
                LogActionEnum.ACTION,
                {
                    workflowId,
                    input: JSON.stringify(input, null, 2),
                    connection: JSON.stringify(connection),
                    actionName,
                    level: 'error'
                },
                `actionName:${actionName}`
            );

            return Err(error);
        } finally {
            const endTime = Date.now();
            const totalRunTime = (endTime - startTime) / 1000;
            metrics.duration(metrics.Types.ACTION_TRACK_RUNTIME, totalRunTime);
        }
    }

    async triggerWebhook<T = any>({
        account,
        environment,
        integration,
        connection,
        webhookName,
        syncConfig,
        input,
        logContextGetter
    }: {
        account: Account;
        environment: Environment;
        integration: ProviderConfig;
        connection: NangoConnection;
        webhookName: string;
        syncConfig: SyncConfig;
        input: object;
        logContextGetter: LogContextGetter;
    }): Promise<Result<T, NangoError>> {
        const log = {
            level: 'info' as LogLevel,
            success: null,
            action: LogActionEnum.WEBHOOK,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: connection.connection_id,
            provider_config_key: connection.provider_config_key,
            provider: integration.provider,
            environment_id: connection.environment_id,
            operation_name: webhookName
        };

        const activityLogId = await createActivityLog(log);
        const logCtx = await logContextGetter.create(
            {
                id: String(activityLogId),
                operation: { type: 'webhook', action: 'incoming' },
                message: 'Received a webhook',
                expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
            },
            {
                account,
                environment,
                integration: { id: integration.id!, name: integration.unique_key, provider: integration.provider },
                connection: { id: connection.id!, name: connection.connection_id },
                syncConfig: { id: syncConfig.id!, name: syncConfig.sync_name }
            }
        );

        const workflowId = `${WEBHOOK_TASK_QUEUE}.WEBHOOK:${syncConfig.sync_name}:${webhookName}.${connection.connection_id}.${Date.now()}`;

        try {
            await createActivityLogMessage({
                level: 'info',
                environment_id: integration.environment_id,
                activity_log_id: activityLogId as number,
                content: `Starting webhook workflow ${workflowId} in the task queue: ${WEBHOOK_TASK_QUEUE}`,
                params: {
                    input: JSON.stringify(input, null, 2)
                },
                timestamp: Date.now()
            });
            await logCtx.info('Starting webhook workflow', { workflowId, input });

            const { credentials, credentials_iv, credentials_tag, deleted, deleted_at, ...nangoConnectionWithoutCredentials } =
                connection as unknown as NangoFullConnection;

            const activeSpan = tracer.scope().active();
            const spanTags = {
                'webhook.name': webhookName,
                'connection.id': connection.id,
                'connection.connection_id': connection.connection_id,
                'connection.provider_config_key': connection.provider_config_key,
                'connection.environment_id': connection.environment_id
            };

            let res: Result<any, NangoError>;

            const isGloballyEnabled = await featureFlags.isEnabled('orchestrator:immediate', 'global', false);
            const isEnvEnabled = await featureFlags.isEnabled('orchestrator:immediate', `${integration.environment_id}`, false);
            if (isGloballyEnabled || isEnvEnabled) {
                const span = tracer.startSpan('execute.webhook', {
                    tags: spanTags,
                    ...(activeSpan ? { childOf: activeSpan } : {})
                });
                try {
                    const groupKey: string = 'webhook';
                    const executionId = `${groupKey}:environment:${connection.environment_id}:connection:${connection.id}:webhook:${webhookName}:at:${new Date().toISOString()}:${uuid()}`;
                    const parsedInput = input ? JSON.parse(JSON.stringify(input)) : null;
                    const args = {
                        webhookName,
                        parentSyncName: syncConfig.sync_name,
                        connection: {
                            id: connection.id!,
                            connection_id: connection.connection_id,
                            provider_config_key: connection.provider_config_key,
                            environment_id: connection.environment_id
                        },
                        input: parsedInput,
                        activityLogId: activityLogId!
                    };
                    const webhookResult = await this.client.executeWebhook({
                        name: executionId,
                        groupKey,
                        args
                    });
                    res = webhookResult.mapError((e) => new NangoError('action_failure', e.payload ?? { error: e.message }));
                    if (res.isErr()) {
                        span.setTag('error', res.error);
                    }
                } catch (e: unknown) {
                    const errorMsg = `Execute: Failed to parse input '${JSON.stringify(input)}': ${stringifyError(e)}`;
                    const error = new NangoError('action_failure', { error: errorMsg });
                    span.setTag('error', e);
                    return Err(error);
                } finally {
                    span.finish();
                }
            } else {
                const span = tracer.startSpan('execute.webhookTemporal', {
                    tags: spanTags,
                    ...(activeSpan ? { childOf: activeSpan } : {})
                });
                try {
                    const temporal = await getTemporal();
                    const webhookHandler = await temporal.workflow.execute('webhook', {
                        taskQueue: WEBHOOK_TASK_QUEUE,
                        workflowId,
                        args: [
                            {
                                name: webhookName,
                                parentSyncName: syncConfig.sync_name,
                                nangoConnection: nangoConnectionWithoutCredentials,
                                input,
                                activityLogId
                            }
                        ]
                    });

                    const { error, response } = webhookHandler;
                    if (error) {
                        res = Err(error);
                    } else {
                        res = Ok(response);
                    }
                    if (res.isErr()) {
                        span.setTag('error', res.error);
                    }
                } catch (e: unknown) {
                    span.setTag('error', e);
                    throw e;
                } finally {
                    span.finish();
                }
            }

            if (res.isErr()) {
                throw res.error;
            }

            await createActivityLogMessageAndEnd({
                level: 'info',
                environment_id: integration.environment_id,
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `The webhook workflow ${workflowId} was successfully run.`
            });
            await logCtx.info('The webhook workflow was successfully run');
            await logCtx.success();

            await updateSuccessActivityLog(activityLogId as number, true);

            return res;
        } catch (e) {
            const errorMessage = stringifyError(e, { pretty: true });
            const error = new NangoError('webhook_script_failure', { errorMessage });

            await createActivityLogMessageAndEnd({
                level: 'error',
                environment_id: integration.environment_id,
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `The webhook workflow ${workflowId} failed with error: ${errorMessage}`
            });
            await logCtx.error('The webhook workflow failed', { error: e });
            await logCtx.failed();

            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.SYNC_CLIENT,
                environmentId: connection.environment_id,
                metadata: {
                    parentSyncName: syncConfig.sync_name,
                    webhookName,
                    connectionDetails: JSON.stringify(connection),
                    input
                }
            });

            return Err(error);
        }
    }

    async triggerPostConnectionScript<T = any>({
        connection,
        name,
        fileLocation,
        activityLogId,
        logCtx
    }: {
        connection: NangoConnection;
        name: string;
        fileLocation: string;
        activityLogId: number;
        logCtx: LogContext;
    }): Promise<Result<T, NangoError>> {
        const startTime = Date.now();
        const workflowId = `${SYNC_TASK_QUEUE}.POST_CONNECTION_SCRIPT:${name}.${connection.connection_id}.${uuid()}`;
        try {
            await createActivityLogMessage({
                level: 'info',
                environment_id: connection.environment_id,
                activity_log_id: activityLogId,
                content: `Starting post connection script workflow ${workflowId} in the task queue: ${SYNC_TASK_QUEUE}`,
                timestamp: Date.now()
            });
            await logCtx.info(`Starting post connection script workflow ${workflowId} in the task queue: ${SYNC_TASK_QUEUE}`);

            let res: Result<any, NangoError>;

            const isGloballyEnabled = await featureFlags.isEnabled('orchestrator:immediate', 'global', false);
            const isEnvEnabled = await featureFlags.isEnabled('orchestrator:immediate', `${connection.environment_id}`, false);
            const activeSpan = tracer.scope().active();
            const spanTags = {
                'postConnection.name': name,
                'connection.id': connection.id,
                'connection.connection_id': connection.connection_id,
                'connection.provider_config_key': connection.provider_config_key,
                'connection.environment_id': connection.environment_id
            };
            if (isGloballyEnabled || isEnvEnabled) {
                const span = tracer.startSpan('execute.action', {
                    tags: spanTags,
                    ...(activeSpan ? { childOf: activeSpan } : {})
                });
                try {
                    const groupKey: string = 'post-connection-script';
                    const executionId = `${groupKey}:environment:${connection.environment_id}:connection:${connection.id}:post-connection-script:${name}:at:${new Date().toISOString()}:${uuid()}`;
                    const args = {
                        postConnectionName: name,
                        connection: {
                            id: connection.id!,
                            connection_id: connection.connection_id,
                            provider_config_key: connection.provider_config_key,
                            environment_id: connection.environment_id
                        },
                        activityLogId,
                        fileLocation
                    };
                    const result = await this.client.executePostConnection({
                        name: executionId,
                        groupKey,
                        args
                    });
                    res = result.mapError((e) => new NangoError('post_connection_failure', e.payload ?? { error: e.message }));
                    if (res.isErr()) {
                        span.setTag('error', res.error);
                    }
                } catch (e: unknown) {
                    span.setTag('error', e);
                    throw e;
                } finally {
                    span.finish();
                }
            } else {
                const span = tracer.startSpan('execute.postConnectionTemporal', {
                    tags: spanTags,
                    ...(activeSpan ? { childOf: activeSpan } : {})
                });
                try {
                    const temporal = await getTemporal();
                    const postConnectionScriptHandler = await temporal.workflow.execute('postConnectionScript', {
                        taskQueue: SYNC_TASK_QUEUE,
                        workflowId,
                        args: [
                            {
                                name,
                                nangoConnection: {
                                    id: connection.id,
                                    connection_id: connection.connection_id,
                                    provider_config_key: connection.provider_config_key,
                                    environment_id: connection.environment_id
                                },
                                fileLocation,
                                activityLogId
                            }
                        ]
                    });

                    const { error: rawError, response }: RunnerOutput = postConnectionScriptHandler;
                    if (rawError) {
                        // Errors received from temporal are raw objects not classes
                        const error = new NangoError(rawError['type'], rawError['payload'], rawError['status']);
                        res = Err(error);
                        await logCtx.error(`Failed with error ${rawError['type']}`, { payload: rawError['payload'] });
                    } else {
                        res = Ok(response);
                    }
                    if (res.isErr()) {
                        span.setTag('error', res.error);
                    }
                } catch (e: unknown) {
                    span.setTag('error', e);
                    throw e;
                } finally {
                    span.finish();
                }
            }

            if (res.isErr()) {
                throw res.error;
            }

            const content = `The post connection script workflow ${workflowId} was successfully run. A truncated response is: ${JSON.stringify(res.value, null, 2)?.slice(0, 100)}`;

            await createActivityLogMessageAndEnd({
                level: 'info',
                environment_id: connection.environment_id,
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content
            });
            await updateSuccessActivityLog(activityLogId, true);
            await logCtx.info(content);
            await logCtx.success();

            await telemetry.log(
                LogTypes.POST_CONNECTION_SCRIPT_SUCCESS,
                content,
                LogActionEnum.POST_CONNECTION_SCRIPT,
                {
                    workflowId,
                    input: '',
                    connection: JSON.stringify(connection),
                    name
                },
                `postConnectionScript:${name}`
            );

            return res;
        } catch (err) {
            const errorMessage = stringifyError(err, { pretty: true });
            const error = new NangoError('post_connection_script_failure', { errorMessage });

            const content = `The post-connection-script workflow ${workflowId} failed with error: ${err}`;

            await createActivityLogMessageAndEnd({
                level: 'error',
                environment_id: connection.environment_id,
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content
            });
            await logCtx.error(content);
            await logCtx.failed();

            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.SYNC_CLIENT,
                environmentId: connection.environment_id,
                metadata: {
                    name,
                    connectionDetails: JSON.stringify(connection)
                }
            });

            await telemetry.log(
                LogTypes.POST_CONNECTION_SCRIPT_FAILURE,
                content,
                LogActionEnum.POST_CONNECTION_SCRIPT,
                {
                    workflowId,
                    input: '',
                    connection: JSON.stringify(connection),
                    name,
                    level: 'error'
                },
                `postConnectionScript:${name}`
            );

            return Err(error);
        } finally {
            const endTime = Date.now();
            const totalRunTime = (endTime - startTime) / 1000;
            metrics.duration(metrics.Types.POST_CONNECTION_SCRIPT_RUNTIME, totalRunTime);
        }
    }

    async updateSyncFrequency({
        syncId,
        interval,
        syncName,
        environmentId,
        activityLogId,
        logCtx
    }: {
        syncId: string;
        interval: string;
        syncName: string;
        environmentId: number;
        activityLogId?: number;
        logCtx?: LogContext;
    }): Promise<Result<void>> {
        const isGloballyEnabled = await featureFlags.isEnabled('orchestrator:schedule', 'global', false);
        const isEnvEnabled = await featureFlags.isEnabled('orchestrator:schedule', `${environmentId}`, false);
        const isOrchestrator = isGloballyEnabled || isEnvEnabled;

        // Orchestrator
        const scheduleName = this.getScheduleName({ environmentId, syncId });
        const frequencyMs = ms(interval as StringValue);
        const res = await this.client.updateSyncFrequency({ scheduleName, frequencyMs });

        // Legacy
        const { success, error } = await updateSyncScheduleFrequency(syncId, interval, syncName, environmentId, activityLogId, logCtx);

        if (isOrchestrator) {
            if (res.isErr()) {
                errorManager.report(res.error, {
                    source: ErrorSourceEnum.PLATFORM,
                    operation: LogActionEnum.SYNC_CLIENT,
                    environmentId,
                    metadata: {
                        syncName,
                        scheduleName,
                        frequencyMs
                    }
                });
            } else {
                await logCtx?.info(`Sync frequency updated to ${frequencyMs}ms.`);
            }
            return res;
        }
        return success ? Ok(undefined) : Err(error?.message ?? 'Failed to update sync frequency');
    }

    async runSyncCommand({
        syncId,
        command,
        activityLogId,
        environmentId,
        logCtx,
        recordsService,
        initiator
    }: {
        syncId: string;
        command: SyncCommand;
        activityLogId: number;
        environmentId: number;
        logCtx: LogContext;
        recordsService: RecordsServiceInterface;
        initiator: string;
    }): Promise<Result<void>> {
        try {
            const cancelling = async (syncId: string): Promise<Result<void>> => {
                const syncJob = await isSyncJobRunning(syncId);
                if (!syncJob || !syncJob?.run_id) {
                    return Err(`Sync job not found for syncId: ${syncId}`);
                }
                await this.client.cancel({ taskId: syncJob?.run_id, reason: initiator });
                return Ok(undefined);
            };
            const scheduleName = this.getScheduleName({ environmentId, syncId });
            switch (command) {
                case SyncCommand.CANCEL:
                    return cancelling(syncId);
                case SyncCommand.PAUSE:
                    return this.client.pauseSync({ scheduleName });
                case SyncCommand.UNPAUSE:
                    return await this.client.unpauseSync({ scheduleName });
                case SyncCommand.RUN:
                    return this.client.executeSync({ scheduleName });
                case SyncCommand.RUN_FULL: {
                    await cancelling(syncId);

                    await clearLastSyncDate(syncId);
                    const del = await recordsService.deleteRecordsBySyncId({ syncId });
                    await createActivityLogMessage({
                        level: 'info',
                        environment_id: environmentId,
                        activity_log_id: activityLogId,
                        timestamp: Date.now(),
                        content: `Records for the sync were deleted successfully`
                    });
                    await logCtx.info(`Records for the sync were deleted successfully`, del);

                    return this.client.executeSync({ scheduleName });
                }
            }
        } catch (err) {
            const errorMessage = stringifyError(err, { pretty: true });

            await createActivityLogMessageAndEnd({
                level: 'error',
                environment_id: environmentId,
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content: `The sync command: ${command} failed with error: ${errorMessage}`
            });
            await logCtx.error(`Sync command failed "${command}"`, { error: err, command });

            return Err(err as Error);
        }
    }

    // TODO: remove once temporal is removed
    async runSyncCommandHelper(props: {
        scheduleId: string;
        syncId: string;
        command: SyncCommand;
        activityLogId: number;
        environmentId: number;
        providerConfigKey: string;
        connectionId: string;
        syncName: string;
        nangoConnectionId?: number | undefined;
        logCtx: LogContext;
        recordsService: RecordsServiceInterface;
        initiator: string;
    }): Promise<Result<void>> {
        const isGloballyEnabled = await featureFlags.isEnabled('orchestrator:schedule', 'global', false);
        const isEnvEnabled = await featureFlags.isEnabled('orchestrator:schedule', `${props.environmentId}`, false);
        const isOrchestrator = isGloballyEnabled || isEnvEnabled;

        if (isOrchestrator) {
            return await this.runSyncCommand({
                syncId: props.syncId,
                command: props.command,
                activityLogId: props.activityLogId,
                environmentId: props.environmentId,
                logCtx: props.logCtx,
                recordsService: props.recordsService,
                initiator: props.initiator
            });
        }

        const syncClient = await SyncClient.getInstance();
        if (!syncClient) {
            return Err(new NangoError('failed_to_get_sync_client'));
        }
        const res = await syncClient.runSyncCommand({
            scheduleId: props.scheduleId,
            syncId: props.syncId,
            command: props.command,
            activityLogId: props.activityLogId,
            environmentId: props.environmentId,
            providerConfigKey: props.providerConfigKey,
            connectionId: props.connectionId,
            syncName: props.syncName,
            nangoConnectionId: props.nangoConnectionId,
            logCtx: props.logCtx,
            recordsService: props.recordsService,
            initiator: props.initiator
        });
        return res.isErr() ? Err(res.error) : Ok(undefined);
    }

    async deleteSync({ syncId, environmentId }: { syncId: string; environmentId: number }): Promise<Result<void>> {
        const res = await this.client.deleteSync({ scheduleName: `environment:${environmentId}:sync:${syncId}` });
        if (res.isErr()) {
            errorManager.report(res.error, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.SYNC,
                environmentId,
                metadata: { syncId, environmentId }
            });
        }
        return res;
    }
}
