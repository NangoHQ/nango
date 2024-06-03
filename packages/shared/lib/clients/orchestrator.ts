import type { LogContext, LogContextGetter } from '@nangohq/logs';
import { Err, Ok, stringifyError, metrics, getLogger } from '@nangohq/utils';
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
    ActionArgs,
    WebhookArgs,
    PostConnectionArgs
} from '@nangohq/nango-orchestrator';
import type { Account } from '../models/Admin.js';
import type { Environment } from '../models/Environment.js';
import type { SyncConfig } from '../models/index.js';

const logger = getLogger('orchestrator.client');

async function getTemporal(): Promise<TemporalClient> {
    const instance = await SyncClient.getInstance();
    if (!instance) {
        throw new Error('Temporal client not initialized');
    }
    return instance.getClient() as TemporalClient;
}

export interface OrchestratorClientInterface {
    executeAction(props: ExecuteActionProps): Promise<ExecuteReturn>;
    executeWebhook(props: ExecuteWebhookProps): Promise<ExecuteReturn>;
    executePostConnection(props: ExecutePostConnectionProps): Promise<ExecuteReturn>;
}

export class Orchestrator {
    private client: OrchestratorClientInterface;

    public constructor(client: OrchestratorClientInterface) {
        this.client = client;
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
            await logCtx.info(`Starting action workflow ${workflowId} in the task queue: ${SYNC_TASK_QUEUE}`, { input: JSON.stringify(input, null, 2) });

            const isOchestratorEnabled = await featureFlags.isEnabled('orchestrator:dryrun', 'global', false, false);
            if (isOchestratorEnabled) {
                try {
                    const groupKey: string = 'action';
                    const executionId = `${groupKey}:environment:${connection.environment_id}:connection:${connection.id}:action:${actionName}:at:${new Date().toISOString()}:${uuid()}`;
                    const parsedInput = JSON.parse(JSON.stringify(input));
                    const args: ActionArgs = {
                        name: actionName,
                        connection: {
                            id: connection.id!,
                            provider_config_key: connection.provider_config_key,
                            environment_id: connection.environment_id
                        },
                        activityLogId,
                        input: parsedInput
                    };
                    // Execute dry-mode: no await for now
                    void this.client
                        .executeAction({
                            name: executionId,
                            groupKey,
                            args,
                            timeoutSettingsInSecs: {
                                createdToStarted: 5,
                                startedToCompleted: 5,
                                heartbeat: 10
                            }
                        })
                        .then(
                            (res) => {
                                if (res.isErr()) {
                                    logger.error(`Error: Execution '${executionId}' failed: ${stringifyError(res.error)}`);
                                } else {
                                    logger.info(`Execution '${executionId}' executed successfully with result: ${JSON.stringify(res.value)}`);
                                }
                            },
                            (error) => {
                                logger.error(`Error: Action '${executionId}' failed: ${stringifyError(error)}`);
                            }
                        );
                } catch (e: unknown) {
                    const errorMsg = `Execute: Failed to parse input object ${JSON.stringify(input)} to JsonValue: ${stringifyError(e)}`;
                    logger.error(errorMsg);
                }
            }

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

            const { success, error: rawError, response }: RunnerOutput = actionHandler;

            // Errors received from temporal are raw objects not classes
            const error = rawError ? new NangoError(rawError['type'], rawError['payload'], rawError['status']) : rawError;
            if (!success || error) {
                if (rawError) {
                    await createActivityLogMessageAndEnd({
                        level: 'error',
                        environment_id,
                        activity_log_id: activityLogId,
                        timestamp: Date.now(),
                        content: `Failed with error ${rawError['type']} ${JSON.stringify(rawError['payload'])}`
                    });
                    await logCtx.error(`Failed with error ${rawError['type']} ${JSON.stringify(rawError['payload'])}`);
                }
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId,
                    timestamp: Date.now(),
                    content: `The action workflow ${workflowId} did not complete successfully`
                });
                await logCtx.error(`The action workflow ${workflowId} did not complete successfully`);

                return Err(error!);
            }

            const content = `The action workflow ${workflowId} was successfully run. A truncated response is: ${JSON.stringify(response, null, 2)?.slice(0, 100)}`;

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

            return Ok(response);
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
            { id: String(activityLogId), operation: { type: 'webhook', action: 'incoming' }, message: 'Received a webhook' },
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

            const isOchestratorEnabled = await featureFlags.isEnabled('orchestrator:dryrun', 'global', false, false);
            if (isOchestratorEnabled) {
                try {
                    const groupKey: string = 'webhook';
                    const executionId = `${groupKey}:environment:${connection.environment_id}:connection:${connection.id}:webhook:${webhookName}:at:${new Date().toISOString()}:${uuid()}`;
                    const parsedInput = JSON.parse(JSON.stringify(input));
                    const args: WebhookArgs = {
                        name: webhookName,
                        parentSyncName: syncConfig.sync_name,
                        connection: {
                            id: connection.id!,
                            provider_config_key: connection.provider_config_key,
                            environment_id: connection.environment_id
                        },
                        input: parsedInput,
                        activityLogId
                    };
                    // Execute dry-mode: no await for now
                    void this.client
                        .executeWebhook({
                            name: executionId,
                            groupKey,
                            args,
                            timeoutSettingsInSecs: {
                                createdToStarted: 5,
                                startedToCompleted: 5,
                                heartbeat: 10
                            }
                        })
                        .then(
                            (res) => {
                                if (res.isErr()) {
                                    logger.error(`Error: Execution '${executionId}' failed: ${stringifyError(res.error)}`);
                                } else {
                                    logger.info(`Execution '${executionId}' executed successfully with result: ${JSON.stringify(res.value)}`);
                                }
                            },
                            (error) => {
                                logger.error(`Error: Action '${executionId}' failed: ${stringifyError(error)}`);
                            }
                        );
                } catch (e: unknown) {
                    const errorMsg = `Execute: Failed to parse input object ${JSON.stringify(input)} to JsonValue: ${stringifyError(e)}`;
                    logger.error(errorMsg);
                }
            }

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

            const { success, error, response } = webhookHandler;

            if (success === false || error) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: integration.environment_id,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `The webhook workflow ${workflowId} did not complete successfully`
                });
                await logCtx.error('The webhook workflow did not complete successfully');
                await logCtx.failed();

                return Err(error);
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

            return Ok(response);
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

            const isOchestratorEnabled = await featureFlags.isEnabled('orchestrator:dryrun', 'global', false, false);
            if (isOchestratorEnabled) {
                const groupKey: string = 'post-connection-script';
                const executionId = `${groupKey}:environment:${connection.environment_id}:connection:${connection.id}:post-connection-script:${name}:at:${new Date().toISOString()}:${uuid()}`;
                const args: PostConnectionArgs = {
                    name,
                    connection: {
                        id: connection.id!,
                        provider_config_key: connection.provider_config_key,
                        environment_id: connection.environment_id
                    },
                    activityLogId,
                    fileLocation
                };

                void this.client
                    .executePostConnection({
                        name: executionId,
                        groupKey,
                        args,
                        timeoutSettingsInSecs: {
                            createdToStarted: 5,
                            startedToCompleted: 5,
                            heartbeat: 10
                        }
                    })
                    .then(
                        (res) => {
                            if (res.isErr()) {
                                logger.error(`Error: Execution '${executionId}' failed: ${stringifyError(res.error)}`);
                            } else {
                                logger.info(`Execution '${executionId}' executed successfully with result: ${res.value}`);
                            }
                        },
                        (error) => {
                            logger.error(`Error: Post connection script '${executionId}' failed: ${stringifyError(error)}`);
                        }
                    );
            }

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

            const { success, error: rawError, response }: RunnerOutput = postConnectionScriptHandler;

            // Errors received from temporal are raw objects not classes
            const error = rawError ? new NangoError(rawError['type'], rawError['payload'], rawError['status']) : rawError;
            if (!success || error) {
                if (rawError) {
                    await createActivityLogMessageAndEnd({
                        level: 'error',
                        environment_id: connection.environment_id,
                        activity_log_id: activityLogId,
                        timestamp: Date.now(),
                        content: `Failed with error ${rawError['type']} ${JSON.stringify(rawError['payload'])}`
                    });
                    await logCtx.error(`Failed with error ${rawError['type']} ${JSON.stringify(rawError['payload'])}`);
                }
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: connection.environment_id,
                    activity_log_id: activityLogId,
                    timestamp: Date.now(),
                    content: `The post connection script workflow ${workflowId} did not complete successfully`
                });
                await logCtx.error(`The post connection script workflow ${workflowId} did not complete successfully`);

                return Err(error!);
            }

            const content = `The post connection script workflow ${workflowId} was successfully run. A truncated response is: ${JSON.stringify(response, null, 2)?.slice(0, 100)}`;

            await createActivityLogMessageAndEnd({
                level: 'info',
                environment_id: connection.environment_id,
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content
            });
            await updateSuccessActivityLog(activityLogId, true);
            await logCtx.info(content);

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

            return Ok(response);
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
}
