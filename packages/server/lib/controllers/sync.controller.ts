import type { Request, Response } from 'express';
import type { NextFunction } from 'express';
import type { LogLevel, Connection } from '@nangohq/shared';
import { getUserAccountAndEnvironmentFromSession } from '../utils/utils.js';
import {
    getEnvironmentId,
    createSyncConfig,
    syncDataService,
    connectionService,
    getSyncs,
    verifyOwnership,
    SyncClient,
    updateScheduleStatus,
    getSyncsFlat,
    updateSuccess as updateSuccessActivityLog,
    createActivityLogAndLogMessage,
    createActivityLogMessageAndEnd,
    createActivityLog,
    getAndReconcileSyncDifferences,
    getSyncConfigsWithConnectionsByEnvironmentId,
    getActiveSyncConfigsByEnvironmentId,
    IncomingSyncConfig,
    getProviderConfigBySyncAndAccount,
    SyncCommand,
    CommandToActivityLog,
    errorManager,
    analytics,
    LogActionEnum
} from '@nangohq/shared';

class SyncController {
    public async deploySync(req: Request, res: Response, next: NextFunction) {
        try {
            const { syncs, reconcile, debug }: { syncs: IncomingSyncConfig[]; reconcile: boolean; debug: boolean } = req.body;
            const environmentId = getEnvironmentId(res);
            let reconcileSuccess = true;

            const syncConfigDeployResult = await createSyncConfig(environmentId, syncs, debug);

            if (reconcile) {
                const success = await getAndReconcileSyncDifferences(environmentId, syncs, reconcile, syncConfigDeployResult?.activityLogId as number, debug);
                if (!success) {
                    reconcileSuccess = false;
                }
            }

            if (!reconcileSuccess) {
                res.status(500).send({ message: 'There was an error deploying syncs, please check the activity tab and report this issue to support' });

                return;
            }

            analytics.trackByEnvironmentId('sync:deploy_succeeded', environmentId);

            res.send(syncConfigDeployResult?.result);
        } catch (e) {
            const environmentId = getEnvironmentId(res);

            await errorManager.report(e, {
                source: 'platform',
                environmentId,
                operation: LogActionEnum.SYNC_DEPLOY
            });

            next(e);
        }
    }

    public async confirmation(req: Request, res: Response, next: NextFunction) {
        try {
            const { syncs, debug }: { syncs: IncomingSyncConfig[]; reconcile: boolean; debug: boolean } = req.body;
            const environmentId = getEnvironmentId(res);

            const result = await getAndReconcileSyncDifferences(environmentId, syncs, false, null, debug);

            res.send(result);
        } catch (e) {
            next(e);
        }
    }

    public async getRecords(req: Request, res: Response, next: NextFunction) {
        try {
            const { model, delta, offset, limit } = req.query;
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
                limit as string
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

    public async getSyncsByParams(req: Request, res: Response, next: NextFunction) {
        try {
            const environment = (await getUserAccountAndEnvironmentFromSession(req)).environment;
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
                res.status(404).send({ message: 'Connection not found!' });

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
            const environment = (await getUserAccountAndEnvironmentFromSession(req)).environment;

            const syncs = await getSyncConfigsWithConnectionsByEnvironmentId(environment.id);

            res.send(syncs);
        } catch (e) {
            next(e);
        }
    }

    public async getSyncNames(_req: Request, res: Response, next: NextFunction) {
        try {
            const environmentId = getEnvironmentId(res);

            const syncs = await getActiveSyncConfigsByEnvironmentId(environmentId);

            res.send(syncs);
        } catch (e) {
            next(e);
        }
    }

    public async trigger(req: Request, res: Response, next: NextFunction) {
        try {
            const environmentId = getEnvironmentId(res);
            const connectionId = req.get('Connection-Id') as string;
            const providerConfigKey = req.get('Provider-Config-Key') as string;

            if (!connectionId) {
                res.status(400).send({ message: 'Missing connection id' });

                return;
            }

            if (!providerConfigKey) {
                res.status(400).send({ message: 'Missing provider config key' });

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

            const syncs = await getSyncsFlat(connection as Connection);

            const syncClient = await SyncClient.getInstance();

            await syncClient?.triggerSyncs(syncs, environmentId);

            res.sendStatus(200);
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

    public async syncCommand(req: Request, res: Response, next: NextFunction) {
        try {
            const environment = (await getUserAccountAndEnvironmentFromSession(req)).environment;
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
                    timestamp: Date.now(),
                    content: `Unauthorized access to run the command: "${action}" for sync: ${sync_id}`
                });

                res.sendStatus(401);
            }

            const activityLogId = await createActivityLog(log);

            const syncClient = await SyncClient.getInstance();
            await syncClient?.runSyncCommand(schedule_id, command, activityLogId as number);
            await updateScheduleStatus(schedule_id, command, activityLogId as number);

            await createActivityLogMessageAndEnd({
                level: 'info',
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `Sync was updated with command: "${action}" for sync: ${sync_id}`
            });
            await updateSuccessActivityLog(activityLogId as number, true);

            analytics.trackByEnvironmentId(`sync:command_${command.toLowerCase()}`, environment.id, {
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
}

export default new SyncController();
