import type { Request, Response } from 'express';
import type { NextFunction } from 'express';
import type { LogAction, LogLevel, Connection } from '@nangohq/shared';
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
    IncomingSyncConfig
} from '@nangohq/shared';

class SyncController {
    public async deploySync(req: Request, res: Response, next: NextFunction) {
        try {
            const { syncs, reconcile, debug }: { syncs: IncomingSyncConfig[]; reconcile: boolean; debug: boolean } = req.body;
            const environmentId = getEnvironmentId(res);

            const result = await createSyncConfig(environmentId, syncs, debug);

            if (reconcile) {
                await getAndReconcileSyncDifferences(environmentId, syncs, reconcile, debug);
            }

            res.send(result);
        } catch (e) {
            next(e);
        }
    }

    public async confirmation(req: Request, res: Response, next: NextFunction) {
        try {
            const { syncs, debug }: { syncs: IncomingSyncConfig[]; reconcile: boolean; debug: boolean } = req.body;
            const environmentId = getEnvironmentId(res);

            const result = await getAndReconcileSyncDifferences(environmentId, syncs, false, debug);

            res.send(result);
        } catch (e) {
            next(e);
        }
    }

    public async getRecords(req: Request, res: Response, next: NextFunction) {
        try {
            const { model, delta, offset, limit } = req.query;
            const environmentId = getEnvironmentId(res);

            if (!model) {
                res.status(400).send({ message: 'Missing sync model' });
            }

            const connectionId = req.get('Connection-Id') as string;
            const providerConfigKey = req.get('Provider-Config-Key') as string;

            const records = await syncDataService.getDataRecords(
                connectionId,
                providerConfigKey,
                environmentId,
                model as string,
                delta as string,
                offset as string,
                limit as string
            );

            res.send(records);
        } catch (e) {
            next(e);
        }
    }

    public async getSyncsByParams(req: Request, res: Response, next: NextFunction) {
        try {
            const environment = (await getUserAccountAndEnvironmentFromSession(req)).environment;
            const { connection_id, provider_config_key } = req.query;

            if (!connection_id) {
                res.status(400).send({ message: 'Missing connection id' });
            }

            if (!provider_config_key) {
                res.status(400).send({ message: 'Missing provider config key' });
            }

            const connection: Connection | null = await connectionService.getConnection(connection_id as string, provider_config_key as string, environment.id);

            if (!connection) {
                res.status(404).send({ message: 'Connection not found!' });
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
            }

            if (!providerConfigKey) {
                res.status(400).send({ message: 'Missing provider config key' });
            }

            const connection: Connection | null = await connectionService.getConnection(connectionId as string, providerConfigKey as string, environmentId);

            const syncs = await getSyncsFlat(connection as Connection);

            const syncClient = await SyncClient.getInstance();

            await syncClient?.triggerSyncs(syncs);

            res.sendStatus(200);
        } catch (e) {
            next(e);
        }
    }

    public async syncCommand(req: Request, res: Response, next: NextFunction) {
        try {
            const environment = (await getUserAccountAndEnvironmentFromSession(req)).environment;
            const { schedule_id, command, nango_connection_id, sync_id, sync_name, provider } = req.body;
            const connection = await connectionService.getConnectionById(nango_connection_id);

            const log = {
                level: 'info' as LogLevel,
                success: false,
                action: 'sync' as LogAction,
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
                    content: `Unauthorized access to run the command: ${command} for sync: ${sync_id}`
                });

                res.sendStatus(401);
            }

            const activityLogId = await createActivityLog(log);

            const syncClient = await SyncClient.getInstance();
            syncClient?.runSyncCommand(schedule_id, command, activityLogId as number);
            await updateScheduleStatus(schedule_id, command, activityLogId as number);

            await createActivityLogMessageAndEnd({
                level: 'info',
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `Sync was updated with command: ${command} for sync: ${sync_id}`
            });
            await updateSuccessActivityLog(activityLogId as number, true);

            res.sendStatus(200);
        } catch (e) {
            next(e);
        }
    }
}

export default new SyncController();
