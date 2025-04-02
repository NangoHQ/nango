import type { Request, Response, NextFunction } from 'express';
import type { HTTP_METHOD, Sync } from '@nangohq/shared';
import tracer from 'dd-trace';
import type { Span } from 'dd-trace';
import {
    connectionService,
    getSyncs,
    verifyOwnership,
    getSyncsByProviderConfigKey,
    getSyncConfigsWithConnectionsByEnvironmentId,
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
    setFrequency,
    getSyncAndActionConfigsBySyncNameAndConfigId,
    syncCommandToOperation,
    getSyncConfigRaw,
    getSyncsByConnectionId
} from '@nangohq/shared';
import type { LogContextOrigin } from '@nangohq/logs';
import { defaultOperationExpiration, logContextGetter, OtlpSpan } from '@nangohq/logs';
import type { Result } from '@nangohq/utils';
import { getHeaders, isHosted, truncateJson, Ok, Err, redactHeaders } from '@nangohq/utils';
import { records as recordsService } from '@nangohq/records';
import type { RequestLocals } from '../utils/express.js';
import { getOrchestrator } from '../utils/utils.js';
import { getInterval } from '@nangohq/nango-yaml';
import { getPublicRecords } from './records/getRecords.js';
import type { DBConnectionDecrypted } from '@nangohq/types';

const orchestrator = getOrchestrator();

class SyncController {
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
            const syncs = await this.addRecordCount(rawSyncs, connection.id, environment.id);
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

            if (!success || !connection) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            const { action, model } = await getActionOrModelByEndpoint(connection, req.method as HTTP_METHOD, path);
            if (action) {
                const input = req.body || req.params[1];
                req.body = {};
                req.body['action_name'] = action;
                req.body['input'] = input;
                await this.triggerAction(req, res, next);
            } else if (model) {
                req.query['model'] = model;
                getPublicRecords(req, res, next);
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
        let logCtx: LogContextOrigin | undefined;
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
                    connection: { id: connection.id, name: connection.connection_id },
                    syncConfig: { id: syncConfig.id, name: syncConfig.sync_name },
                    meta: truncateJson({ input })
                }
            );
            logCtx.attachSpan(new OtlpSpan(logCtx.operation));

            const actionResponse = await getOrchestrator().triggerAction({
                accountId: account.id,
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
                void logCtx.error('Failed to run action', { error: err });
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
                    headers: redactHeaders({ headers: reqHeaders })
                },
                response: {
                    code: res.statusCode,
                    headers: redactHeaders({ headers: getHeaders(res.getHeaders()) })
                }
            });
        }
    }

    public async pause(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { syncs, provider_config_key, connection_id } = req.body;

            if (!provider_config_key) {
                res.status(400).send({ message: 'Missing provider config key' });

                return;
            }

            const syncIdentifiers = normalizedSyncParams(syncs);
            if (syncIdentifiers.isErr()) {
                res.status(400).send({ message: syncIdentifiers.error.message });
                return;
            }

            const { environment } = res.locals;

            await syncManager.runSyncCommand({
                recordsService,
                orchestrator,
                environment,
                providerConfigKey: provider_config_key as string,
                syncIdentifiers: syncIdentifiers.value,
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
            const { syncs, provider_config_key, connection_id } = req.body;

            if (!provider_config_key) {
                res.status(400).send({ message: 'Missing provider config key' });

                return;
            }

            const syncIdentifiers = normalizedSyncParams(syncs);
            if (syncIdentifiers.isErr()) {
                res.status(400).send({ message: syncIdentifiers.error.message });
                return;
            }

            const { environment } = res.locals;

            await syncManager.runSyncCommand({
                recordsService,
                orchestrator,
                environment,
                providerConfigKey: provider_config_key as string,
                syncIdentifiers: syncIdentifiers.value,
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
            const { syncs, provider_config_key, connection_id } = req.query;

            if (!provider_config_key) {
                res.status(400).send({ message: 'Missing provider config key' });

                return;
            }

            let syncIdentifiers = syncs === '*' ? Ok([]) : normalizedSyncParams(typeof syncs === 'string' ? syncs.split(',') : syncs);
            if (syncIdentifiers.isErr()) {
                res.status(400).send({ message: syncIdentifiers.error.message });
                return;
            }

            const environmentId = res.locals['environment'].id;

            let connection: DBConnectionDecrypted | null = null;

            if (connection_id) {
                const connectionResult = await connectionService.getConnection(connection_id as string, provider_config_key as string, environmentId);
                const { success: connectionSuccess, error: connectionError } = connectionResult;
                if (!connectionSuccess || !connectionResult.response) {
                    errorManager.errResFromNangoErr(res, connectionError);
                    return;
                }

                connection = connectionResult.response;
            }

            if (syncIdentifiers.value.length <= 0) {
                if (connection && connection.id) {
                    const syncs = await getSyncsByConnectionId({ connectionId: connection.id });
                    if (syncs) {
                        syncIdentifiers = Ok(syncs.map((sync) => ({ syncName: sync.name, syncVariant: sync.variant })));
                    }
                } else {
                    const syncs = await getSyncsByProviderConfigKey({ environmentId, providerConfigKey: provider_config_key as string });
                    if (syncs) {
                        syncIdentifiers = Ok(syncs.map((sync) => ({ syncName: sync.name, syncVariant: sync.variant })));
                    }
                }
            }

            if (syncIdentifiers.isErr()) {
                res.status(400).send({ message: `syncs parameter is invalid. Received ${JSON.stringify(syncs)}` });
                return;
            }

            const {
                success,
                error,
                response: syncsWithStatus
            } = await syncManager.getSyncStatus({
                environmentId,
                providerConfigKey: provider_config_key as string,
                syncIdentifiers: syncIdentifiers.value,
                orchestrator,
                recordsService,
                connectionId: connection_id as string,
                includeJobStatus: false,
                optionalConnection: connection
            });

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
        let logCtx: LogContextOrigin | undefined;

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
                    connection: { id: connection.id, name: connection.connection_id },
                    syncConfig: { id: syncConfig.id, name: syncConfig.sync_name }
                }
            );

            if (!(await verifyOwnership(nango_connection_id, environment.id, sync_id))) {
                void logCtx.error('Unauthorized access to run the command');
                await logCtx.failed();

                res.status(401).json({ error: { code: 'forbidden' } });
                return;
            }

            const result = await orchestrator.runSyncCommand({
                connectionId: connection.id,
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

            void logCtx.info(`Sync command run successfully "${command}"`, { command, syncId: sync_id });
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
                void logCtx.error('Failed to sync command', { error: err });
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

    /**
     * PUT /sync/update-connection-frequency
     *
     * Allow users to change the default frequency value of a sync without losing the value.
     * The system will store the value inside `_nango_syncs.frequency` and update the relevant schedules.
     */
    public async updateFrequencyForConnection(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { sync_name, sync_variant, provider_config_key, connection_id, frequency } = req.body;

            if (!provider_config_key || typeof provider_config_key !== 'string') {
                res.status(400).send({ message: 'provider_config_key must be a string' });
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

            if (!sync_name) {
                res.status(400).send({ message: 'Missing sync name' });
                return;
            }

            const sync = sync_variant ? { name: sync_name, variant: sync_variant } : sync_name;
            const syncIdentifiers = normalizedSyncParams([sync]);
            if (syncIdentifiers.isErr()) {
                res.status(400).send({ message: syncIdentifiers.error.message });
                return;
            }
            if (!syncIdentifiers.value[0]) {
                res.status(400).send({ message: 'error processing sync name/variant' });
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

            const syncs =
                (await getSyncsByConnectionId({
                    connectionId: connection.id,
                    filter: syncIdentifiers.value
                })) || [];
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
                const selected = syncConfigs[0];
                if (!selected || !selected.runs) {
                    res.status(400).send({ message: 'failed to find sync' });
                    return;
                }
                newFrequency = selected.runs;
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

function normalizedSyncParams(syncs: any): Result<{ syncName: string; syncVariant: string }[]> {
    if (!syncs) {
        return Err('Missing sync names');
    }
    if (!Array.isArray(syncs)) {
        return Err('syncs must be an array');
    }

    const syncIdentifiers = syncs.map((sync) => {
        if (typeof sync === 'string') {
            if (sync.includes('::')) {
                const [name, variant] = sync.split('::');
                return { syncName: name, syncVariant: variant };
            }
            return { syncName: sync, syncVariant: 'base' };
        }

        if (typeof sync === 'object' && sync !== null && typeof sync.name === 'string' && typeof sync.variant === 'string') {
            return { syncName: sync.name, syncVariant: sync.variant };
        }

        return null; // Mark invalid entries
    });

    if (syncIdentifiers.some((sync) => sync === null)) {
        return Err('syncs must be either strings or { name: string, variant: string } objects');
    }
    return Ok(syncIdentifiers as { syncName: string; syncVariant: string }[]);
}

export default new SyncController();
