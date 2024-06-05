import type { LogContext, LogContextGetter } from '@nangohq/logs';
import { Err, Ok, stringifyError, metrics } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { NangoError } from '../utils/error.js';
import telemetry, { LogTypes } from '../utils/telemetry.js';
import type { RunnerOutput } from '../models/Runner.js';
import type { NangoConnection, Connection as NangoFullConnection } from '../models/Connection.js';
import { SYNC_TASK_QUEUE, WEBHOOK_TASK_QUEUE } from '../constants.js';
import { v4 as uuid } from 'uuid';
import featureFlags from '../utils/featureflags.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import type { Config as ProviderConfig } from '../models/Provider.js';
import SyncClient from './sync.client.js';
import type { Client as TemporalClient } from '@temporalio/client';
import { LogActionEnum } from '../models/Activity.js';
import type { ExecuteReturn, ExecuteActionProps, ExecuteWebhookProps, ExecutePostConnectionProps } from '@nangohq/nango-orchestrator';
import type { Account } from '../models/Admin.js';
import type { Environment } from '../models/Environment.js';
import type { SyncConfig } from '../models/index.js';
import tracer from 'dd-trace';

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
        environment_id,
        logCtx
    }: {
        connection: NangoConnection;
        actionName: string;
        input: object;
        environment_id: number;
        logCtx: LogContext;
    }): Promise<Result<T, NangoError>> {
        const startTime = Date.now();
        const workflowId = `${SYNC_TASK_QUEUE}.ACTION:${actionName}.${connection.connection_id}.${uuid()}`;
        try {
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
                        activityLogId: logCtx.id,
                        input: parsedInput
                    };
                    const actionResult = await this.client.executeAction({
                        name: executionId,
                        groupKey,
                        args
                    });
                    res = actionResult.mapError((e) => new NangoError('action_failure', e.payload ?? { error: e.message }));
                    if (res.isErr()) {
                        span.setTag('error', res.error);
                    }
                } catch (e: unknown) {
                    const errorMsg = `Execute: Failed to parse input '${JSON.stringify(input)}': ${stringifyError(e)}`;
                    const error = new NangoError('action_failure', { error: errorMsg });
                    span.setTag('error', e);

                    await logCtx.error('Failed to parse input', { error: e });

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
                                activityLogId: logCtx.id
                            }
                        ]
                    });

                    const { error: rawError, response }: RunnerOutput = actionHandler;
                    if (rawError) {
                        // Errors received from temporal are raw objects not classes
                        const error = new NangoError(rawError['type'], rawError['payload'], rawError['status']);
                        res = Err(error);
                        await logCtx.error(`Failed with error ${rawError['type']} ${JSON.stringify(rawError['payload'])}`);
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
                await logCtx.error(`The action workflow ${workflowId} did not complete successfully`, { error: res.error });
                return res;
            }

            const content = `The action workflow ${workflowId} was successfully run. A truncated response is: ${JSON.stringify(res.value, null, 2)?.slice(0, 100)}`;

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
        const logCtx = await logContextGetter.create(
            {
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
                        activityLogId: logCtx.id
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
                                activityLogId: logCtx.id
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
                await logCtx.error('The webhook workflow did not complete successfully');
                await logCtx.failed();

                return res;
            }

            await logCtx.info('The webhook workflow was successfully run');
            await logCtx.success();

            return res;
        } catch (e) {
            const errorMessage = stringifyError(e, { pretty: true });
            const error = new NangoError('webhook_script_failure', { errorMessage });

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
        logCtx
    }: {
        connection: NangoConnection;
        name: string;
        fileLocation: string;
        logCtx: LogContext;
    }): Promise<Result<T, NangoError>> {
        const startTime = Date.now();
        const workflowId = `${SYNC_TASK_QUEUE}.POST_CONNECTION_SCRIPT:${name}.${connection.connection_id}.${uuid()}`;
        try {
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
                            provider_config_key: connection.provider_config_key,
                            environment_id: connection.environment_id
                        },
                        activityLogId: logCtx.id,
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
                                activityLogId: logCtx.id
                            }
                        ]
                    });

                    const { error: rawError, response }: RunnerOutput = postConnectionScriptHandler;
                    if (rawError) {
                        // Errors received from temporal are raw objects not classes
                        const error = new NangoError(rawError['type'], rawError['payload'], rawError['status']);
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
                await logCtx.error('Failed with error', { error: res.error });
                return res;
            }

            const content = `The post connection script workflow ${workflowId} was successfully run. A truncated response is: ${JSON.stringify(res.value, null, 2)?.slice(0, 100)}`;

            await logCtx.info('Run successfully', { output: res.value });

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

            await logCtx.error('Failed with error', { error: err });

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
