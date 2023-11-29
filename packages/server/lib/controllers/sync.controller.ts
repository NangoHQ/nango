import type { Request, Response } from 'express';
import type { NextFunction } from 'express';
import type { LogLevel, Connection, NangoConnection, HTTP_VERB } from '@nangohq/shared';
import { getUserAccountAndEnvironmentFromSession } from '../utils/utils.js';
import {
    getEnvironmentId,
    deploy as deploySyncConfig,
    syncDataService,
    connectionService,
    getSyncs,
    verifyOwnership,
    getSyncsByProviderConfigKey,
    SyncClient,
    updateScheduleStatus,
    updateSuccess as updateSuccessActivityLog,
    createActivityLogAndLogMessage,
    createActivityLogMessageAndEnd,
    createActivityLog,
    getAndReconcileDifferences,
    getSyncConfigsWithConnectionsByEnvironmentId,
    IncomingFlowConfig,
    getProviderConfigBySyncAndAccount,
    SyncCommand,
    CommandToActivityLog,
    ServiceResponse,
    errorManager,
    analytics,
    AnalyticsTypes,
    ErrorSourceEnum,
    LogActionEnum,
    NangoError,
    LastAction,
    configService,
    syncOrchestrator,
    getAttributes,
    flowService,
    getActionOrModelByEndpoint
} from '@nangohq/shared';

class SyncController {
    public async deploySync(req: Request, res: Response, next: NextFunction) {
        try {
            const {
                syncs,
                reconcile,
                debug,
                singleDeployMode
            }: { syncs: IncomingFlowConfig[]; reconcile: boolean; debug: boolean; singleDeployMode?: boolean } = req.body;
            const environmentId = getEnvironmentId(res);
            let reconcileSuccess = true;

            const { success, error, response: syncConfigDeployResult } = await deploySyncConfig(environmentId, syncs, req.body.nangoYamlBody || '', debug);

            if (!success) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            if (reconcile) {
                const success = await getAndReconcileDifferences(
                    environmentId,
                    syncs,
                    reconcile,
                    syncConfigDeployResult?.activityLogId as number,
                    debug,
                    singleDeployMode
                );
                if (!success) {
                    reconcileSuccess = false;
                }
            }

            if (!reconcileSuccess) {
                res.status(500).send({ message: 'There was an error deploying syncs, please check the activity tab and report this issue to support' });

                return;
            }

            analytics.trackByEnvironmentId(AnalyticsTypes.SYNC_DEPLOY_SUCCESS, environmentId);

            res.send(syncConfigDeployResult?.result);
        } catch (e) {
            const environmentId = getEnvironmentId(res);

            await errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                environmentId,
                operation: LogActionEnum.SYNC_DEPLOY
            });

            next(e);
        }
    }

    public async confirmation(req: Request, res: Response, next: NextFunction) {
        try {
            const { syncs, debug, singleDeployMode }: { syncs: IncomingFlowConfig[]; reconcile: boolean; debug: boolean; singleDeployMode?: boolean } =
                req.body;
            const environmentId = getEnvironmentId(res);

            const result = await getAndReconcileDifferences(environmentId, syncs, false, null, debug, singleDeployMode);

            res.send(result);
        } catch (e) {
            next(e);
        }
    }

    // to deprecate
    public async getRecords(req: Request, res: Response, next: NextFunction) {
        try {
            const { model, delta, offset, limit, sort_by, order, filter, include_nango_metadata } = req.query;
            const environmentId = getEnvironmentId(res);
            const connectionId = req.get('Connection-Id') as string;
            const providerConfigKey = req.get('Provider-Config-Key') as string;

            const {
                success,
                error,
                response: records
            } = await syncDataService.getDataRecords(
                connectionId,
                providerConfigKey,
                environmentId,
                model as string,
                delta as string,
                offset as string,
                limit as string,
                sort_by as string,
                order as 'asc' | 'desc',
                filter as LastAction,
                include_nango_metadata === 'true'
            );

            if (!success) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            res.send(records);
        } catch (e) {
            next(e);
        }
    }

    public async getAllRecords(req: Request, res: Response, next: NextFunction) {
        try {
            const { model, delta, limit, filter, cursor } = req.query;
            const environmentId = getEnvironmentId(res);
            const connectionId = req.get('Connection-Id') as string;
            const providerConfigKey = req.get('Provider-Config-Key') as string;

            const { success, error, response } = await syncDataService.getAllDataRecords(
                connectionId,
                providerConfigKey,
                environmentId,
                model as string,
                delta as string,
                limit as string,
                filter as LastAction,
                cursor as string
            );

            if (!success || !response) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            res.send(response);
        } catch (e) {
            next(e);
        }
    }

    public async getSyncsByParams(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

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

            const syncs = await getSyncs(connection as Connection);

            res.send(syncs);
        } catch (e) {
            next(e);
        }
    }

    public async getSyncs(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            const syncs = await getSyncConfigsWithConnectionsByEnvironmentId(environment.id);
            const flows = flowService.getAllAvailableFlows();

            res.send({ syncs, flows });
        } catch (e) {
            next(e);
        }
    }

    public async trigger(req: Request, res: Response, next: NextFunction) {
        try {
            const { syncs: syncNames } = req.body;
            let { provider_config_key, connection_id } = req.body;

            if (!provider_config_key) {
                provider_config_key = req.get('Provider-Config-Key') as string;
            }

            if (!connection_id) {
                connection_id = req.get('Connection-Id') as string;
            }

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

            const environmentId = getEnvironmentId(res);

            const { success, error } = await syncOrchestrator.runSyncCommand(
                environmentId,
                provider_config_key as string,
                syncNames as string[],
                SyncCommand.RUN,
                connection_id
            );

            if (!success) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            res.sendStatus(200);
        } catch (e) {
            next(e);
        }
    }

    public async actionOrModel(req: Request, res: Response, next: NextFunction) {
        try {
            const environmentId = getEnvironmentId(res);
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
            const {
                success,
                error,
                response: connection
            } = await connectionService.getConnection(connectionId as string, providerConfigKey as string, environmentId);

            if (!success) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            const { action, model } = await getActionOrModelByEndpoint(connection as NangoConnection, req.method as HTTP_VERB, path);
            if (action) {
                const input = req.body;
                req.body = {};
                req.body['action_name'] = action;
                req.body['input'] = input;
                await this.triggerAction(req, res, next);
            } else if (model) {
                req.query['model'] = model;
                await this.getRecords(req, res, next);
            } else {
                res.status(404).send({ message: `Unknown endpoint '${req.method} ${path}'` });
            }
        } catch (e) {
            next(e);
        }
    }

    public async triggerAction(req: Request, res: Response, next: NextFunction) {
        try {
            const environmentId = getEnvironmentId(res);
            const connectionId = req.get('Connection-Id') as string;
            const providerConfigKey = req.get('Provider-Config-Key') as string;

            const { input, action_name } = req.body;

            if (!action_name) {
                res.status(400).send({ error: 'Missing action name' });

                return;
            }

            if (!connectionId) {
                res.status(400).send({ error: 'Missing connection id' });

                return;
            }

            if (!providerConfigKey) {
                res.status(400).send({ error: 'Missing provider config key' });

                return;
            }

            const {
                success,
                error,
                response: connection
            } = await connectionService.getConnection(connectionId as string, providerConfigKey as string, environmentId);

            if (!success) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            const provider = await configService.getProviderName(providerConfigKey as string);

            const log = {
                level: 'info' as LogLevel,
                success: false,
                action: LogActionEnum.ACTION,
                start: Date.now(),
                end: Date.now(),
                timestamp: Date.now(),
                connection_id: connection?.connection_id as string,
                provider,
                provider_config_key: connection?.provider_config_key as string,
                environment_id: environmentId,
                operation_name: action_name
            };

            const activityLogId = await createActivityLog(log);

            const syncClient = await SyncClient.getInstance();

            const {
                success: actionSuccess,
                error: actionError,
                response: actionResponse
            } = (await syncClient?.triggerAction(
                connection as Connection,
                action_name as string,
                input,
                activityLogId as number,
                environmentId
            )) as ServiceResponse;

            if (!actionSuccess) {
                errorManager.errResFromNangoErr(res, actionError);
                return;
            } else {
                res.send(actionResponse);
                return;
            }
        } catch (e) {
            next(e);
        }
    }

    public async getSyncProvider(req: Request, res: Response, next: NextFunction) {
        try {
            const environmentId = getEnvironmentId(res);
            const { syncName } = req.query;

            if (!syncName) {
                res.status(400).send({ message: 'Missing sync name!' });

                return;
            }

            const providerConfigKey = await getProviderConfigBySyncAndAccount(syncName as string, environmentId as number);

            res.send(providerConfigKey);
        } catch (e) {
            next(e);
        }
    }

    public async pause(req: Request, res: Response, next: NextFunction) {
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

            const environmentId = getEnvironmentId(res);

            await syncOrchestrator.runSyncCommand(environmentId, provider_config_key as string, syncNames as string[], SyncCommand.PAUSE, connection_id);

            res.sendStatus(200);
        } catch (e) {
            next(e);
        }
    }

    public async start(req: Request, res: Response, next: NextFunction) {
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

            const environmentId = getEnvironmentId(res);

            await syncOrchestrator.runSyncCommand(environmentId, provider_config_key as string, syncNames as string[], SyncCommand.UNPAUSE, connection_id);

            res.sendStatus(200);
        } catch (e) {
            next(e);
        }
    }

    public async getSyncStatus(req: Request, res: Response, next: NextFunction) {
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

            const environmentId = getEnvironmentId(res);

            if (syncNames === '*') {
                syncNames = await getSyncsByProviderConfigKey(environmentId, provider_config_key as string).then((syncs) => syncs.map((sync) => sync.name));
            } else {
                syncNames = (syncNames as string).split(',');
            }

            const {
                success,
                error,
                response: syncsWithStatus
            } = await syncOrchestrator.getSyncStatus(environmentId, provider_config_key as string, syncNames as string[], connection_id as string);

            if (!success || !syncsWithStatus) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            res.send({ syncs: syncsWithStatus });
        } catch (e) {
            next(e);
        }
    }

    public async syncCommand(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            const { schedule_id, command, nango_connection_id, sync_id, sync_name, provider } = req.body;
            const connection = await connectionService.getConnectionById(nango_connection_id);

            const action = CommandToActivityLog[command as SyncCommand];

            const log = {
                level: 'info' as LogLevel,
                success: false,
                action,
                start: Date.now(),
                end: Date.now(),
                timestamp: Date.now(),
                connection_id: connection?.connection_id as string,
                provider,
                provider_config_key: connection?.provider_config_key as string,
                environment_id: environment.id,
                operation_name: sync_name
            };

            if (!verifyOwnership(nango_connection_id, environment.id, sync_id)) {
                await createActivityLogAndLogMessage(log, {
                    level: 'error',
                    environment_id: environment.id,
                    timestamp: Date.now(),
                    content: `Unauthorized access to run the command: "${action}" for sync: ${sync_id}`
                });

                res.sendStatus(401);
            }

            const activityLogId = await createActivityLog(log);

            const syncClient = await SyncClient.getInstance();
            await syncClient?.runSyncCommand(schedule_id, sync_id, command, activityLogId as number, environment.id);
            if (command !== SyncCommand.RUN) {
                await updateScheduleStatus(schedule_id, command, activityLogId as number, environment.id);
            }

            await createActivityLogMessageAndEnd({
                level: 'info',
                environment_id: environment.id,
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `Sync was updated with command: "${action}" for sync: ${sync_id}`
            });
            await updateSuccessActivityLog(activityLogId as number, true);

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
            }

            analytics.trackByEnvironmentId(event, environment.id, {
                sync_id,
                sync_name,
                provider,
                provider_config_key: connection?.provider_config_key as string,
                connection_id: connection?.connection_id as string,
                schedule_id
            });

            res.sendStatus(200);
        } catch (e) {
            next(e);
        }
    }

    public async getFlowAttributes(req: Request, res: Response, next: NextFunction) {
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
}

export default new SyncController();
