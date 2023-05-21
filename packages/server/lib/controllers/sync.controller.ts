import type { Request, Response } from 'express';
import type { NextFunction } from 'express';
import { getAccount, createSyncConfig, syncDataService } from '@nangohq/shared';

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
            const { model, delta } = req.query;
            const accountId = getAccount(res);

            if (!model) {
                res.status(400).send({ message: 'Missing sync model' });
            }

            const connectionId = req.get('Connection-Id') as string;
            const providerConfigKey = req.get('Provider-Config-Key') as string;

            const records = await syncDataService.getDataRecords(connectionId, providerConfigKey, accountId, model as string, delta as string);

            res.send(records);
        } catch (e) {
            next(e);
        }
    }
}

export default new SyncController();
