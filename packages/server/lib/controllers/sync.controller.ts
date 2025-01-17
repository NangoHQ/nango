import type { Request, Response, NextFunction } from 'express';
import type { NangoConnection, HTTP_METHOD, Connection, Sync } from '@nangohq/shared';
import tracer from 'dd-trace';
import type { Span } from 'dd-trace';
import {
    connectionService,
    getSyncs,
    verifyOwnership,
    isSyncValid,
    getSyncNamesByConnectionId,
    getSyncsByProviderConfigKey,
    getSyncConfigsWithConnectionsByEnvironmentId,
    getProviderConfigBySyncAndAccount,
    SyncCommand,
    errorManager,
    analytics,
    AnalyticsTypes,
    NangoError,
    configService,
    syncManager,
    getAttributes,
    flowService,
    getActionOrModelByEndpoint,
    findSyncByConnections,
    setFrequency,
    getSyncAndActionConfigsBySyncNameAndConfigId,
    trackFetch,
    syncCommandToOperation,
    getSyncConfigRaw
} from '@nangohq/shared';
import type { LogContext } from '@nangohq/logs';
import { defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import type { LastAction } from '@nangohq/records';
import { getHeaders, isHosted, truncateJson } from '@nangohq/utils';
import { records as recordsService } from '@nangohq/records';
import type { RequestLocals } from '../utils/express.js';
import { getOrchestrator } from '../utils/utils.js';
import { getInterval } from '@nangohq/nango-yaml';

const orchestrator = getOrchestrator();

class SyncController {
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
        } catch (err) {
            next(err);
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

            const rawSyncs = await getSyncs(connection, orchestrator);
            const syncs = await this.addRecordCount(rawSyncs, connection.id!, environment.id);
            res.send(syncs);
        } catch (err) {
            next(err);
        }
    }

    private async addRecordCount(syncs: (Sync & { models: string[] })[], connectionId: number, environmentId: number) {
        const byModel = await recordsService.getRecordCountsByModel({ connectionId, environmentId });

        if (byModel.isOk()) {
            return syncs.map((sync) => ({
                ...sync,
                record_count: Object.fromEntries(sync.models.map((model) => [model, byModel.value[model]?.count ?? 0]))
            }));
        } else {
            return syncs.map((sync) => ({ ...sync, record_count: null }));
        }
    }

    public async getSyncs(_: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment } = res.locals;

            const syncs = await getSyncConfigsWithConnectionsByEnvironmentId(environment.id);
            const flows = flowService.getAllAvailableFlows();

            res.send({ syncs, flows });
        } catch (err) {
            next(err);
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

            res.status(200).send({ success: true });
        } catch (err) {
            next(err);
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

            const { action, model } = await getActionOrModelByEndpoint(connection as NangoConnection, req.method as HTTP_METHOD, path);
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
        } catch (err) {
            next(err);
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

            span.setTag('nango.actionName', action_name)
                .setTag('nango.connectionId', connectionId)
                .setTag('nango.environmentId', environmentId)
                .setTag('nango.providerConfigKey', providerConfigKey);
            logCtx = await logContextGetter.create(
                { operation: { type: 'action', action: 'run' }, expiresAt: defaultOperationExpiration.action() },
                {
                    account,
                    environment,
                    integration: { id: provider.id!, name: connection.provider_config_key, provider: provider.provider },
                    connection: { id: connection.id!, name: connection.connection_id },
                    syncConfig: { id: syncConfig.id, name: syncConfig.sync_name },
                    meta: truncateJson({ input })
                }
            );

            const actionResponse = await getOrchestrator().triggerAction({
                connection,
                actionName: action_name,
                input,
                logCtx
            });

            if (actionResponse.isOk()) {
                span.finish();
                await logCtx.success();
                res.status(200).json(actionResponse.value);

                return;
            } else {
                span.setTag('nango.error', actionResponse.error);
                await logCtx.failed();

                if (actionResponse.error.type === 'script_http_error') {
                    res.status(424).json({
                        error: {
                            payload: actionResponse.error.payload,
                            code: actionResponse.error.type,
                            ...(actionResponse.error.additional_properties && 'upstream_response' in actionResponse.error.additional_properties
                                ? { upstream: actionResponse.error.additional_properties['upstream_response'] }
                                : {})
                        }
                    });
                } else {
                    errorManager.errResFromNangoErr(res, actionResponse.error);
                }

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
        } finally {
            const reqHeaders = getHeaders(req.headers);
            reqHeaders['authorization'] = 'REDACTED';
            await logCtx?.enrichOperation({
                request: {
                    url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
                    method: req.method,
                    headers: reqHeaders
                },
                response: {
                    code: res.statusCode,
                    headers: getHeaders(res.getHeaders())
                }
            });
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
        } catch (err) {
            next(err);
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

            res.status(200).send({ success: true });
        } catch (err) {
            next(err);
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

            res.status(200).send({ success: true });
        } catch (err) {
            next(err);
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
                recordsService,
                connection_id as string,
                false,
                connection
            );

            if (!success || !syncsWithStatus) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            res.send({ syncs: syncsWithStatus });
        } catch (err) {
            next(err);
        }
    }

    public async syncCommand(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        let logCtx: LogContext | undefined;

        try {
            const { account, environment } = res.locals;

            const { schedule_id, command, nango_connection_id, sync_id, sync_name, provider, delete_records } = req.body;
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

            logCtx = await logContextGetter.create(
                { operation: { type: 'sync', action: syncCommandToOperation[command as SyncCommand] } },
                {
                    account,
                    environment,
                    integration: { id: config.id!, name: config.unique_key, provider: config.provider },
                    connection: { id: connection.id!, name: connection.connection_id },
                    syncConfig: { id: syncConfig.id, name: syncConfig.sync_name }
                }
            );

            if (!(await verifyOwnership(nango_connection_id, environment.id, sync_id))) {
                await logCtx.error('Unauthorized access to run the command');
                await logCtx.failed();

                res.status(401).json({ error: { code: 'forbidden' } });
                return;
            }

            const result = await orchestrator.runSyncCommand({
                connectionId: connection.id!,
                syncId: sync_id,
                command,
                environmentId: environment.id,
                logCtx,
                recordsService,
                initiator: 'UI',
                delete_records
            });

            if (result.isErr()) {
                errorManager.handleGenericError(result.error, req, res);
                await logCtx.failed();
                return;
            }

            await logCtx.info(`Sync command run successfully "${command}"`, { command, syncId: sync_id });
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

            res.status(200).json({ data: { success: true } });
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
        } catch (err) {
            next(err);
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
        } catch (err) {
            next(err);
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
                    const error = new NangoError(interval.message);
                    res.status(400).send({ message: error.message });
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
        } catch (err) {
            next(err);
        }
    }
}

export default new SyncController();
