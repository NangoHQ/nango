import type { Request, Response } from 'express';
import type { NextFunction } from 'express';

import { getUserAndAccountFromSession } from '../utils/utils.js';
import { getLogsByAccount } from '@nangohq/shared';

class ActivityController {
    public async retrieve(req: Request, res: Response, next: NextFunction) {
        try {
            const account = (await getUserAndAccountFromSession(req)).account;
            const logs = await getLogsByAccount(account.id);
            res.send(logs);
        } catch (error) {
            next(error);
        }
    }
}

export default new ActivityController();
