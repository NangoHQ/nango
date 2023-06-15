import type { Request, Response } from 'express';
import type { NextFunction } from 'express';

import { getUserAndAccountFromSession } from '../utils/utils.js';
import { getLogsByAccount } from '@nangohq/shared';

class ActivityController {
    public async retrieve(req: Request, res: Response, next: NextFunction) {
        try {
            const limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : 30;
            const offset = req.query['offset'] ? parseInt(req.query['offset'] as string) : 0;
            const account = (await getUserAndAccountFromSession(req)).account;
            const logs = await getLogsByAccount(account.id, limit, offset);
            res.send(logs);
        } catch (error) {
            next(error);
        }
    }
}

export default new ActivityController();
