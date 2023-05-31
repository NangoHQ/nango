import type { Request, Response } from 'express';
import type { NextFunction } from 'express';
import type { Connection } from '@nangohq/shared';
import { getUserAndAccountFromSession } from '../utils/utils.js';
import { getAccount, createSyncConfig, syncDataService, connectionService, getSyncs, verifyOwnership, SyncClient, updateScheduleStatus } from '@nangohq/shared';

class SyncController {
    public async createSyncConfig(req: Request, res: Response, next: NextFunction) {
        try {
            const { integrationName, provider, snippet } = req.body;
            const accountId = getAccount(res);

            if (!integrationName) {
                res.status(400).send({ message: 'Missing integration name' });
            }

            if (!snippet) {
                res.status(400).send({ message: 'Missing integration code' });
            }

            const result = await createSyncConfig(accountId, provider, integrationName, snippet);

            if (result) {
                res.sendStatus(200);
            } else {
                res.sendStatus(500);
            }
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

            const syncs = await getSyncs(connection?.id as number);

            res.send(syncs);
        } catch (e) {
            next(e);
        }
    }

    public async syncCommand(req: Request, res: Response, next: NextFunction) {
        try {
            const account = (await getUserAndAccountFromSession(req)).account;
            const { schedule_id, command, nango_connection_id, sync_id } = req.body;
            if (!verifyOwnership(nango_connection_id, account.id, sync_id)) {
                res.sendStatus(401);
            }

            const syncClient = await SyncClient.getInstance();
            syncClient.runSyncCommand(schedule_id, command);
            await updateScheduleStatus(schedule_id, command);

            res.sendStatus(200);
        } catch (e) {
            next(e);
        }
    }
}

export default new SyncController();
