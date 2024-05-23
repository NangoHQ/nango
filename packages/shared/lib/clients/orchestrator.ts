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
import type { TExecuteReturn, TExecuteProps } from '@nangohq/nango-orchestrator';

const logger = getLogger('orchestrator.client');

async function getTemporal(): Promise<TemporalClient> {
    const instance = await SyncClient.getInstance();
    if (!instance) {
        throw new Error('Temporal client not initialized');
    }
    return instance.getClient() as TemporalClient;
}

export interface OrchestratorClientInterface {
    execute(props: TExecuteProps): Promise<TExecuteReturn>;
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
        writeLogs = true,
        logCtx
    }: {
        connection: NangoConnection;
        actionName: string;
        input: object;
        activityLogId: number;
        environment_id: number;
        writeLogs?: boolean;
        logCtx: LogContext;
    }): Promise<Result<T, NangoError>> {
        const startTime = Date.now();
        const workflowId = `${SYNC_TASK_QUEUE}.ACTION:${actionName}.${connection.connection_id}.${uuid()}`;
        try {
            if (writeLogs) {
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
            }

            // Execute dry-mode: no await for now
            const groupKey: string = 'action';
            this.dryExecute({
                executionId: `${groupKey}:environment:${connection.environment_id}:connection:${connection.id}:action:${actionName}:at:${new Date().toISOString()}:${uuid()}`,
                groupKey,
                args: {
                    name: actionName,
                    connection: {
                        id: connection.id!,
                        provider_config_key: connection.provider_config_key,
                        environment_id: connection.environment_id
                    },
                    activityLogId,
                    input: input
                }
            });

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
                        activityLogId: writeLogs ? activityLogId : undefined
                    }
                ]
            });

            const { success, error: rawError, response }: RunnerOutput = actionHandler;

            // Errors received from temporal are raw objects not classes
            const error = rawError ? new NangoError(rawError['type'], rawError['payload'], rawError['status']) : rawError;
            if (!success || error) {
                if (writeLogs) {
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
                }

                return Err(error!);
            }

            const content = `The action workflow ${workflowId} was successfully run. A truncated response is: ${JSON.stringify(response, null, 2)?.slice(0, 100)}`;

            if (writeLogs) {
                await createActivityLogMessageAndEnd({
                    level: 'info',
                    environment_id,
                    activity_log_id: activityLogId,
                    timestamp: Date.now(),
                    content
                });
                await updateSuccessActivityLog(activityLogId, true);
                await logCtx.info(content);
            }

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

            if (writeLogs) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId,
                    timestamp: Date.now(),
                    content
                });
                await logCtx.error(content);
            }

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

    async triggerWebhook<T = any>(
        integration: ProviderConfig,
        connection: NangoConnection,
        webhookName: string,
        parentSyncName: string,
        input: object,
        logContextGetter: LogContextGetter
    ): Promise<Result<T, NangoError>> {
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
                account: { id: connection.account_id! },
                environment: { id: integration.environment_id },
                config: { id: integration.id!, name: integration.unique_key },
                connection: { id: connection.id!, name: connection.connection_id }
            }
        );

        const workflowId = `${WEBHOOK_TASK_QUEUE}.WEBHOOK:${parentSyncName}:${webhookName}.${connection.connection_id}.${Date.now()}`;

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

            // Execute dry-mode: no await for now
            const groupKey: string = 'webhook';
            this.dryExecute({
                executionId: `${groupKey}:environment:${connection.environment_id}:connection:${connection.id}:webhook:${webhookName}:at:${new Date().toISOString()}:${uuid()}`,
                groupKey,
                args: {
                    name: webhookName,
                    parentSyncName,
                    connection: {
                        id: connection.id!,
                        provider_config_key: connection.provider_config_key,
                        environment_id: connection.environment_id
                    },
                    input,
                    activityLogId
                }
            });

            const temporal = await getTemporal();
            const webhookHandler = await temporal.workflow.execute('webhook', {
                taskQueue: WEBHOOK_TASK_QUEUE,
                workflowId,
                args: [
                    {
                        name: webhookName,
                        parentSyncName,
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
                    parentSyncName,
                    webhookName,
                    connectionDetails: JSON.stringify(connection),
                    input
                }
            });

            return Err(error);
        }
    }
    // TODO: remove once Temporal has been removed
    private async dryExecute({ executionId, groupKey, args }: { executionId: string; groupKey: string; args: Record<string, any> }): Promise<void> {
        const isEnabled = await featureFlags.isEnabled('orchestrator:dryrun', 'global', false, false);
        if (!isEnabled) {
            return;
        }

        if ('input' in args) {
            const { input, ...rest } = args;
            try {
                // TODO: make input a JsonValue once Temporal has been removed
                args = { ...rest, input: JSON.parse(JSON.stringify(input)) };
            } catch (e: unknown) {
                const errorMsg = `Execute: Failed to parse input object ${JSON.stringify(input)} to JsonValue: ${stringifyError(e)}`;
                logger.error(errorMsg);
            }
        }
        return this.client
            .execute({
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
                    logger.error(`Error: Action '${executionId}' failed: ${stringifyError(error)}`);
                }
            );
    }
}
