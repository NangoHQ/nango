import type { Request, Response, NextFunction } from 'express';
import type { LogLevel, NangoConnection, HTTP_VERB, Connection, IncomingFlowConfig } from '@nangohq/shared';
import type { PostConnectionScriptByProvider } from '@nangohq/types';
import tracer from 'dd-trace';
import type { Span } from 'dd-trace';
import {
    deploy as deployScriptConfig,
    connectionService,
    getSyncs,
    verifyOwnership,
    isSyncValid,
    getSyncNamesByConnectionId,
    getSyncsByProviderConfigKey,
    SyncClient,
    updateScheduleStatus,
    updateSuccess as updateSuccessActivityLog,
    createActivityLogMessageAndEnd,
    createActivityLog,
    getAndReconcileDifferences,
    getSyncConfigsWithConnectionsByEnvironmentId,
    getProviderConfigBySyncAndAccount,
    SyncCommand,
    CommandToActivityLog,
    errorManager,
    analytics,
    AnalyticsTypes,
    ErrorSourceEnum,
    LogActionEnum,
    NangoError,
    configService,
    syncManager,
    getAttributes,
    flowService,
    getActionOrModelByEndpoint,
    getSyncsBySyncConfigId,
    updateFrequency,
    findSyncByConnections,
    setFrequency,
    getSyncAndActionConfigsBySyncNameAndConfigId,
    createActivityLogMessage,
    trackFetch,
    syncCommandToOperation,
    getSyncConfigRaw
} from '@nangohq/shared';
import type { LogContext } from '@nangohq/logs';
import { defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import type { LastAction } from '@nangohq/records';
import { isHosted } from '@nangohq/utils';
import { records as recordsService } from '@nangohq/records';
import type { RequestLocals } from '../utils/express.js';
import { getOrchestrator } from '../utils/utils.js';
import { getInterval } from '@nangohq/nango-yaml';

const orchestrator = getOrchestrator();

class SyncController {
    public async deploySync(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            let debug: boolean;
            let singleDeployMode: boolean | undefined;
            let flowConfigs: IncomingFlowConfig[];
            let postConnectionScriptsByProvider: PostConnectionScriptByProvider[] | undefined = [];
            let reconcile: boolean;

            if (req.body.syncs) {
                ({
                    syncs: flowConfigs,
                    reconcile,
                    debug,
                    singleDeployMode
                } = req.body as { syncs: IncomingFlowConfig[]; reconcile: boolean; debug: boolean; singleDeployMode?: boolean });
            } else {
                ({ flowConfigs, postConnectionScriptsByProvider, reconcile, debug, singleDeployMode } = req.body as {
                    flowConfigs: IncomingFlowConfig[];
                    postConnectionScriptsByProvider: PostConnectionScriptByProvider[];
                    reconcile: boolean;
                    debug: boolean;
                    singleDeployMode?: boolean;
                });
            }

            const { environment, account } = res.locals;
            let reconcileSuccess = true;

            const {
                success,
                error,
                response: syncConfigDeployResult
            } = await deployScriptConfig({
                environment,
                account,
                flows: flowConfigs,
                nangoYamlBody: req.body.nangoYamlBody || '',
                postConnectionScriptsByProvider,
                debug,
                logContextGetter,
                orchestrator
            });

            if (!success) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            if (reconcile) {
                const logCtx = await logContextGetter.get({ id: String(syncConfigDeployResult?.activityLogId) });
                const success = await getAndReconcileDifferences({
                    environmentId: environment.id,
                    flows: flowConfigs,
                    performAction: reconcile,
                    activityLogId: syncConfigDeployResult?.activityLogId as number,
                    debug,
                    singleDeployMode,
                    logCtx,
                    logContextGetter,
                    orchestrator
                });
                if (!success) {
                    reconcileSuccess = false;
                }
            }

            if (!reconcileSuccess) {
                res.status(500).send({ message: 'There was an error deploying syncs, please check the activity tab and report this issue to support' });

                return;
            }

            void analytics.trackByEnvironmentId(AnalyticsTypes.SYNC_DEPLOY_SUCCESS, environment.id);

            res.send(syncConfigDeployResult?.result);
        } catch (e) {
            const environmentId = res.locals['environment'].id;

            errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                environmentId,
                operation: LogActionEnum.SYNC_DEPLOY
            });

            next(e);
        }
    }

    public async confirmation(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            let debug: boolean, singleDeployMode: boolean | undefined, flowConfigs: IncomingFlowConfig[];
            if (req.body.syncs) {
                ({ syncs: flowConfigs, debug, singleDeployMode } = req.body as { syncs: IncomingFlowConfig[]; debug: boolean; singleDeployMode?: boolean });
            } else {
                ({ flowConfigs, debug, singleDeployMode } = req.body as { flowConfigs: IncomingFlowConfig[]; debug: boolean; singleDeployMode?: boolean });
            }

            const environmentId = res.locals['environment'].id;

            const result = await getAndReconcileDifferences({
                environmentId,
                flows: flowConfigs,
                performAction: false,
                activityLogId: null,
                debug,
                singleDeployMode,
                logContextGetter,
                orchestrator
            });

            res.send(result);
        } catch (e) {
            next(e);
        }
    }

    public async getAllRecords(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { model, delta, modified_after, modifiedAfter, limit, filter, cursor, next_cursor } = req.query;
            const environmentId = res.locals['environment'].id;
            const connectionId = req.get('Connection-Id') as string;
            const providerConfigKey = req.get('Provider-Config-Key') as string;

            if (modifiedAfter) {
                const error = new NangoError('incorrect_param', { incorrect: 'modifiedAfter', correct: 'modified_after' });

                errorManager.errResFromNangoErr(res, error);
                return;
            }

            if (next_cursor) {
                const error = new NangoError('incorrect_param', { incorrect: 'next_cursor', correct: 'cursor' });

                errorManager.errResFromNangoErr(res, error);
                return;
            }

            const { error, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environmentId);

            if (error || !connection) {
                const nangoError = new NangoError('unknown_connection', { connectionId, providerConfigKey, environmentId });
                errorManager.errResFromNangoErr(res, nangoError);
                return;
            }

            const result = await recordsService.getRecords({
                connectionId: connection.id as number,
                model: model as string,
                modifiedAfter: (delta || modified_after) as string,
                limit: limit as string,
                filter: filter as LastAction,
                cursor: cursor as string
            });

            if (result.isErr()) {
                errorManager.errResFromNangoErr(res, new NangoError('pass_through_error', result.error));
                return;
            }
            await trackFetch(connection.id as number);
            res.send(result.value);
        } catch (e) {
            next(e);
        }
    }

    public async getSyncsByParams(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment } = res.locals;
            const { connection_id, provider_config_key } = req.query;

            const {
                success,
                error,
                response: connection
            } = await connectionService.getConnection(connection_id as string, provider_config_key as string, environment.id);

            if (!success) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            if (!connection) {
                const error = new NangoError('unknown_connection', { connection_id, provider_config_key, environmentName: environment.name });
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            if (isHosted) {
                res.send([]);
                return;
            }

            const syncs = await getSyncs(connection, orchestrator);

            res.send(syncs);
        } catch (e) {
            next(e);
        }
    }

    public async getSyncs(_: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment } = res.locals;

            const syncs = await getSyncConfigsWithConnectionsByEnvironmentId(environment.id);
            const flows = flowService.getAllAvailableFlows();

            res.send({ syncs, flows });
        } catch (e) {
            next(e);
        }
    }

    public async trigger(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { syncs: syncNames, full_resync } = req.body;

            const provider_config_key: string | undefined = req.body.provider_config_key || req.get('Provider-Config-Key');
            if (!provider_config_key) {
                res.status(400).send({ message: 'Missing provider config key' });

                return;
            }

            const connection_id: string | undefined = req.body.connection_id || req.get('Connection-Id');

            if (typeof syncNames === 'string') {
                res.status(400).send({ message: 'Syncs must be an array' });

                return;
            }

            if (!syncNames) {
                res.status(400).send({ message: 'Missing sync names' });

                return;
            }

            if (full_resync && typeof full_resync !== 'boolean') {
                res.status(400).send({ message: 'full_resync must be a boolean' });
                return;
            }

            const { environment } = res.locals;

            const { success, error } = await syncManager.runSyncCommand({
                recordsService,
                orchestrator,
                environment,
                providerConfigKey: provider_config_key,
                syncNames: syncNames as string[],
                command: full_resync ? SyncCommand.RUN_FULL : SyncCommand.RUN,
                logContextGetter,
                connectionId: connection_id!,
                initiator: 'API call'
            });

            if (!success) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            res.sendStatus(200);
        } catch (e) {
            next(e);
        }
    }

    public async actionOrModel(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environmentId = res.locals['environment'].id;
            const providerConfigKey = req.get('Provider-Config-Key') as string;
            const connectionId = req.get('Connection-Id') as string;
            const path = '/' + req.params['0'];
            if (!connectionId) {
                res.status(400).send({ error: 'Missing connection id' });

                return;
            }

            if (!providerConfigKey) {
                res.status(400).send({ error: 'Missing provider config key' });

                return;
            }
            const { success, error, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environmentId);

            if (!success) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            const { action, model } = await getActionOrModelByEndpoint(connection as NangoConnection, req.method as HTTP_VERB, path);
            if (action) {
                const input = req.body || req.params[1];
                req.body = {};
                req.body['action_name'] = action;
                req.body['input'] = input;
                await this.triggerAction(req, res, next);
            } else if (model) {
                req.query['model'] = model;
                await this.getAllRecords(req, res, next);
            } else {
                res.status(404).send({ message: `Unknown endpoint '${req.method} ${path}'` });
            }
        } catch (e) {
            next(e);
        }
    }

    public async triggerAction(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        const active = tracer.scope().active();
        const span = tracer.startSpan('server.sync.triggerAction', {
            childOf: active as Span
        });

        const { input, action_name } = req.body;
        const { account, environment } = res.locals;
        const environmentId = environment.id;
        const connectionId = req.get('Connection-Id');
        const providerConfigKey = req.get('Provider-Config-Key');
        let logCtx: LogContext | undefined;
        try {
            if (!action_name || typeof action_name !== 'string') {
                res.status(400).send({ error: 'Missing action name' });

                span.finish();
                return;
            }

            if (!connectionId) {
                res.status(400).send({ error: 'Missing connection id' });

                span.finish();
                return;
            }

            if (!providerConfigKey) {
                res.status(400).send({ error: 'Missing provider config key' });

                span.finish();
                return;
            }

            const { success, error, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environmentId);

            if (!success || !connection) {
                errorManager.errResFromNangoErr(res, error);

                span.finish();
                return;
            }

            const provider = await configService.getProviderConfig(providerConfigKey, environmentId);
            if (!provider) {
                res.status(404).json({ error: { code: 'not_found' } });
                return;
            }

            const syncConfig = await getSyncConfigRaw({ environmentId, config_id: provider.id!, name: action_name, isAction: true });
            if (!syncConfig) {
                res.status(404).json({ error: { code: 'not_found' } });
                return;
            }

            const log = {
                level: 'info' as LogLevel,
                success: false,
                action: LogActionEnum.ACTION,
                start: Date.now(),
                end: Date.now(),
                timestamp: Date.now(),
                connection_id: connection.connection_id,
                provider: provider.provider,
                provider_config_key: connection.provider_config_key,
                environment_id: environmentId,
                operation_name: action_name
            };

            span.setTag('nango.actionName', action_name)
                .setTag('nango.connectionId', connectionId)
                .setTag('nango.environmentId', environmentId)
                .setTag('nango.providerConfigKey', providerConfigKey);

            const activityLogId = await createActivityLog(log);
            if (!activityLogId) {
                throw new NangoError('failed_to_create_activity_log');
            }

            logCtx = await logContextGetter.create(
                {
                    id: String(activityLogId),
                    operation: { type: 'action' },
                    message: 'Start action',
                    expiresAt: defaultOperationExpiration.action()
                },
                {
                    account,
                    environment,
                    integration: { id: provider.id!, name: connection.provider_config_key, provider: provider.provider },
                    connection: { id: connection.id!, name: connection.connection_id },
                    syncConfig: { id: syncConfig.id!, name: syncConfig.sync_name },
                    meta: { input }
                }
            );

            const syncClient = await SyncClient.getInstance();

            if (!syncClient) {
                throw new NangoError('failed_to_get_sync_client');
            }

            const actionResponse = await getOrchestrator().triggerAction({
                connection,
                actionName: action_name,
                input,
                activityLogId,
                environment_id: environmentId,
                logCtx
            });

            if (actionResponse.isOk()) {
                span.finish();
                await logCtx.success();
                res.status(200).json(actionResponse.value);

                return;
            } else {
                span.setTag('nango.error', actionResponse.error);
                await logCtx.error('Failed to run action', { error: actionResponse.error });
                await logCtx.failed();

                errorManager.errResFromNangoErr(res, actionResponse.error);
                span.finish();
                return;
            }
        } catch (err) {
            span.setTag('nango.error', err);
            span.finish();
            if (logCtx) {
                await logCtx.error('Failed to run action', { error: err });
                await logCtx.failed();
            }

            next(err);
        }
    }

    public async getSyncProvider(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environmentId = res.locals['environment'].id;
            const { syncName } = req.query;

            if (!syncName) {
                res.status(400).send({ message: 'Missing sync name!' });

                return;
            }

            const providerConfigKey = await getProviderConfigBySyncAndAccount(syncName as string, environmentId);

            res.send(providerConfigKey);
        } catch (e) {
            next(e);
        }
    }

    public async pause(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { syncs: syncNames, provider_config_key, connection_id } = req.body;

            if (!provider_config_key) {
                res.status(400).send({ message: 'Missing provider config key' });

                return;
            }

            if (typeof syncNames === 'string') {
                res.status(400).send({ message: 'Syncs must be an array' });

                return;
            }

            if (!syncNames) {
                res.status(400).send({ message: 'Missing sync names' });

                return;
            }

            const { environment } = res.locals;

            await syncManager.runSyncCommand({
                recordsService,
                orchestrator,
                environment,
                providerConfigKey: provider_config_key as string,
                syncNames: syncNames as string[],
                command: SyncCommand.PAUSE,
                logContextGetter,
                connectionId: connection_id,
                initiator: 'API call'
            });

            res.sendStatus(200);
        } catch (e) {
            next(e);
        }
    }

    public async start(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { syncs: syncNames, provider_config_key, connection_id } = req.body;

            if (!provider_config_key) {
                res.status(400).send({ message: 'Missing provider config key' });

                return;
            }

            if (typeof syncNames === 'string') {
                res.status(400).send({ message: 'Syncs must be an array' });

                return;
            }

            if (!syncNames) {
                res.status(400).send({ message: 'Missing sync names' });

                return;
            }

            const { environment } = res.locals;

            await syncManager.runSyncCommand({
                recordsService,
                orchestrator,
                environment,
                providerConfigKey: provider_config_key as string,
                syncNames: syncNames as string[],
                command: SyncCommand.UNPAUSE,
                logContextGetter,
                connectionId: connection_id,
                initiator: 'API call'
            });

            res.sendStatus(200);
        } catch (e) {
            next(e);
        }
    }

    public async getSyncStatus(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { syncs: passedSyncNames, provider_config_key, connection_id } = req.query;

            let syncNames = passedSyncNames;

            if (!provider_config_key) {
                res.status(400).send({ message: 'Missing provider config key' });

                return;
            }

            if (!syncNames) {
                res.status(400).send({ message: 'Sync names must be passed in' });

                return;
            }

            const environmentId = res.locals['environment'].id;

            let connection: Connection | null = null;

            if (connection_id) {
                const connectionResult = await connectionService.getConnection(connection_id as string, provider_config_key as string, environmentId);
                const { success: connectionSuccess, error: connectionError } = connectionResult;
                if (!connectionSuccess || !connectionResult.response) {
                    errorManager.errResFromNangoErr(res, connectionError);
                    return;
                }

                connection = connectionResult.response;
            }

            if (syncNames === '*') {
                if (connection && connection.id) {
                    syncNames = await getSyncNamesByConnectionId(connection.id);
                } else {
                    const syncs = await getSyncsByProviderConfigKey(environmentId, provider_config_key as string);
                    syncNames = syncs.map((sync) => sync.name);
                }
            } else {
                syncNames = (syncNames as string).split(',');
            }

            const {
                success,
                error,
                response: syncsWithStatus
            } = await syncManager.getSyncStatus(
                environmentId,
                provider_config_key as string,
                syncNames,
                orchestrator,
                connection_id as string,
                false,
                connection
            );

            if (!success || !syncsWithStatus) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            res.send({ syncs: syncsWithStatus });
        } catch (e) {
            next(e);
        }
    }

    public async syncCommand(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        let logCtx: LogContext | undefined;

        try {
            const { account, environment } = res.locals;

            const { schedule_id, command, nango_connection_id, sync_id, sync_name, provider } = req.body;
            const connection = await connectionService.getConnectionById(nango_connection_id);
            if (!connection) {
                res.status(404).json({ error: { code: 'not_found' } });
                return;
            }

            const config = await configService.getProviderConfig(connection.provider_config_key, environment.id);
            if (!config) {
                res.status(404).json({ error: { code: 'not_found' } });
                return;
            }

            const syncConfig = await getSyncConfigRaw({ environmentId: config.environment_id, config_id: config.id!, name: sync_name, isAction: false });
            if (!syncConfig) {
                res.status(404).json({ error: { code: 'not_found' } });
                return;
            }

            const action = CommandToActivityLog[command as SyncCommand];

            const log = {
                level: 'info' as LogLevel,
                success: false,
                action,
                start: Date.now(),
                end: Date.now(),
                timestamp: Date.now(),
                connection_id: connection.connection_id,
                provider,
                provider_config_key: connection.provider_config_key,
                environment_id: environment.id,
                operation_name: sync_name
            };
            const activityLogId = await createActivityLog(log);
            logCtx = await logContextGetter.create(
                {
                    id: String(activityLogId),
                    operation: { type: 'sync', action: syncCommandToOperation[command as SyncCommand] },
                    message: `Trigger ${command}`
                },
                {
                    account,
                    environment,
                    integration: { id: config.id!, name: config.unique_key, provider: config.provider },
                    connection: { id: connection.id!, name: connection.connection_id },
                    syncConfig: { id: syncConfig.id!, name: syncConfig.sync_name }
                }
            );

            if (!(await verifyOwnership(nango_connection_id, environment.id, sync_id))) {
                await createActivityLogMessage({
                    level: 'error',
                    activity_log_id: activityLogId!,
                    environment_id: environment.id,
                    timestamp: Date.now(),
                    content: `Unauthorized access to run the command: "${action}" for sync: ${sync_id}`
                });
                await logCtx.error('Unauthorized access to run the command');
                await logCtx.failed();

                res.sendStatus(401);
                return;
            }

            const result = await orchestrator.runSyncCommandHelper({
                scheduleId: schedule_id,
                syncId: sync_id,
                command,
                activityLogId: activityLogId as number,
                environmentId: environment.id,
                providerConfigKey: connection?.provider_config_key,
                connectionId: connection?.connection_id,
                syncName: sync_name,
                nangoConnectionId: connection?.id,
                logCtx,
                recordsService,
                initiator: 'UI'
            });

            if (result.isErr()) {
                errorManager.handleGenericError(result.error, req, res, tracer);
                await logCtx.failed();
                return;
            }

            if (command !== SyncCommand.RUN) {
                await updateScheduleStatus(schedule_id, command, activityLogId as number, environment.id, logCtx);
            }

            await createActivityLogMessageAndEnd({
                level: 'info',
                environment_id: environment.id,
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `Sync was updated with command: "${action}" for sync: ${sync_id}`
            });
            await updateSuccessActivityLog(activityLogId as number, true);
            await logCtx.info(`Sync command run successfully "${action}"`, { action, syncId: sync_id });
            await logCtx.success();

            let event = AnalyticsTypes.SYNC_RUN;

            switch (command) {
                case SyncCommand.PAUSE:
                    event = AnalyticsTypes.SYNC_PAUSE;
                    break;
                case SyncCommand.UNPAUSE:
                    event = AnalyticsTypes.SYNC_UNPAUSE;
                    break;
                case SyncCommand.RUN:
                    event = AnalyticsTypes.SYNC_RUN;
                    break;
                case SyncCommand.CANCEL:
                    event = AnalyticsTypes.SYNC_CANCEL;
                    break;
            }

            void analytics.trackByEnvironmentId(event, environment.id, {
                sync_id,
                sync_name,
                provider,
                provider_config_key: connection?.provider_config_key,
                connection_id: connection?.connection_id,
                schedule_id
            });

            res.sendStatus(200);
        } catch (err) {
            if (logCtx) {
                await logCtx.error('Failed to sync command', { error: err });
                await logCtx.failed();
            }
            next(err);
        }
    }

    public async getFlowAttributes(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { sync_name, provider_config_key } = req.query;

            if (!provider_config_key) {
                res.status(400).send({ message: 'Missing provider config key' });

                return;
            }

            if (!sync_name) {
                res.status(400).send({ message: 'Missing sync name' });

                return;
            }

            const attributes = await getAttributes(provider_config_key as string, sync_name as string);

            res.status(200).send(attributes);
        } catch (e) {
            next(e);
        }
    }

    public async updateFrequency(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment } = res.locals;
            const syncConfigId = req.params['syncId'];
            const { frequency } = req.body;

            if (!syncConfigId) {
                res.status(400).send({ message: 'Missing sync config id' });

                return;
            }

            if (!frequency) {
                res.status(400).send({ message: 'Missing frequency' });

                return;
            }

            const syncs = await getSyncsBySyncConfigId(environment.id, Number(syncConfigId));
            const setFrequency = `every ${frequency}`;
            for (const sync of syncs) {
                const updated = await orchestrator.updateSyncFrequency({
                    syncId: sync.id,
                    interval: setFrequency,
                    syncName: sync.name,
                    environmentId: environment.id
                });

                if (updated.isErr()) {
                    const error = new NangoError('failed_to_update_frequency', { syncId: sync.id, frequency: setFrequency });
                    errorManager.errResFromNangoErr(res, error);
                    return;
                }
            }
            await updateFrequency(Number(syncConfigId), setFrequency);

            res.sendStatus(200);
        } catch (e) {
            next(e);
        }
    }

    public async deleteSync(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const syncId = req.params['syncId'];
            const { connection_id, provider_config_key } = req.query;

            if (!provider_config_key) {
                res.status(400).send({ message: 'Missing provider config key' });

                return;
            }

            if (!syncId) {
                res.status(400).send({ message: 'Missing sync id' });

                return;
            }

            if (!connection_id) {
                res.status(400).send({ message: 'Missing connection id' });

                return;
            }

            const environmentId = res.locals['environment'].id;

            const isValid = await isSyncValid(connection_id as string, provider_config_key as string, environmentId, syncId);

            if (!isValid) {
                res.status(400).send({ message: 'Invalid sync id' });

                return;
            }

            await syncManager.softDeleteSync(syncId, environmentId, orchestrator);

            res.sendStatus(204);
        } catch (e) {
            next(e);
        }
    }

    /**
     * PUT /sync/update-connection-frequency
     *
     * Allow users to change the default frequency value of a sync without losing the value.
     * The system will store the value inside `_nango_syncs.frequency` and update the relevant schedules.
     */
    public async updateFrequencyForConnection(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { sync_name, provider_config_key, connection_id, frequency } = req.body;

            if (!provider_config_key || typeof provider_config_key !== 'string') {
                res.status(400).send({ message: 'provider_config_key must be a string' });
                return;
            }
            if (!sync_name || typeof sync_name !== 'string') {
                res.status(400).send({ message: 'sync_name must be a string' });
                return;
            }
            if (!connection_id || typeof connection_id !== 'string') {
                res.status(400).send({ message: 'connection_id must be a string' });
                return;
            }
            if (typeof frequency !== 'string' && frequency !== null) {
                res.status(400).send({ message: 'frequency must be a string or null' });
                return;
            }

            let newFrequency: string | undefined;
            if (frequency) {
                const interval = getInterval(frequency, new Date());
                if (interval instanceof Error) {
                    res.status(400).send({ message: 'frequency must have a valid format (https://github.com/vercel/ms)' });
                    return;
                }
                newFrequency = interval.interval;
            }

            const envId = res.locals['environment'].id;

            const getConnection = await connectionService.getConnection(connection_id, provider_config_key, envId);
            if (!getConnection.response || getConnection.error) {
                res.status(400).send({ message: 'Invalid connection_id' });
                return;
            }
            const connection = getConnection.response;

            const syncs = await findSyncByConnections([Number(connection.id)], sync_name);
            if (syncs.length <= 0) {
                res.status(400).send({ message: 'Invalid sync_name' });
                return;
            }
            const syncId = syncs[0]!.id;

            // When "frequency === null" we revert the value stored in the sync config
            if (!newFrequency) {
                const providerId = await configService.getIdByProviderConfigKey(envId, provider_config_key);
                const syncConfigs = await getSyncAndActionConfigsBySyncNameAndConfigId(envId, providerId!, sync_name);
                if (syncConfigs.length <= 0) {
                    res.status(400).send({ message: 'Invalid sync_name' });
                    return;
                }
                newFrequency = syncConfigs[0]!.runs;
            }

            await setFrequency(syncId, frequency);

            const updated = await orchestrator.updateSyncFrequency({
                syncId,
                interval: newFrequency,
                syncName: sync_name,
                environmentId: connection.environment_id
            });

            if (updated.isErr()) {
                const error = new NangoError('failed_to_update_frequency', { syncId, frequency: newFrequency });
                errorManager.errResFromNangoErr(res, error);
                return;
            }
            res.status(200).send({ frequency: newFrequency });
        } catch (e) {
            next(e);
        }
    }
}

export default new SyncController();
