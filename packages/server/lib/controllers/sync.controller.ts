import type { Request, Response } from 'express';
import type { NextFunction } from 'express';
import { getAccount } from '../utils/utils.js';
import { createSyncConfig } from '@nangohq/shared';

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
}

export default new SyncController();
