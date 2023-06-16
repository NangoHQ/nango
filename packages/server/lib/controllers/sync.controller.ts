import type { Request, Response } from 'express';
import type { NextFunction } from 'express';
import type { LogAction, LogLevel, Connection } from '@nangohq/shared';
import { getUserAndAccountFromSession } from '../utils/utils.js';
import {
    getAccount,
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
    createActivityLog
} from '@nangohq/shared';

class SyncController {
    public async deploySync(req: Request, res: Response, next: NextFunction) {
        try {
            const syncs = req.body;
            const accountId = getAccount(res);

            const result = await createSyncConfig(accountId, syncs);

            res.send(result);
        } catch (e) {
            next(e);
        }
    }

    public async getRecords(req: Request, res: Response, next: NextFunction) {
        try {
            const { model, delta, offset, limit } = req.query;
            const accountId = getAccount(res);

            if (!model) {
                res.status(400).send({ message: 'Missing sync model' });
            }

            const connectionId = req.get('Connection-Id') as string;
            const providerConfigKey = req.get('Provider-Config-Key') as string;

            const records = await syncDataService.getDataRecords(
                connectionId,
                providerConfigKey,
                accountId,
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

    public async getSyncs(req: Request, res: Response, next: NextFunction) {
        try {
            const account = (await getUserAndAccountFromSession(req)).account;
            const { connection_id, provider_config_key } = req.query;

            if (!connection_id) {
                res.status(400).send({ message: 'Missing connection id' });
            }

            if (!provider_config_key) {
                res.status(400).send({ message: 'Missing provider config key' });
            }

            const connection: Connection | null = await connectionService.getConnection(connection_id as string, provider_config_key as string, account.id);

            if (!connection) {
                res.status(404).send({ message: 'Connection not found!' });
            }

            const syncs = await getSyncs(connection as Connection);

            res.send(syncs);
        } catch (e) {
            next(e);
        }
    }

    public async trigger(req: Request, res: Response, next: NextFunction) {
        try {
            const accountId = getAccount(res);
            const connectionId = req.get('Connection-Id') as string;
            const providerConfigKey = req.get('Provider-Config-Key') as string;

            if (!connectionId) {
                res.status(400).send({ message: 'Missing connection id' });
            }

            if (!providerConfigKey) {
                res.status(400).send({ message: 'Missing provider config key' });
            }

            const connection: Connection | null = await connectionService.getConnection(connectionId as string, providerConfigKey as string, accountId);

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
            const account = (await getUserAndAccountFromSession(req)).account;
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
                account_id: account.id,
                operation_name: sync_name
            };

            if (!verifyOwnership(nango_connection_id, account.id, sync_id)) {
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
