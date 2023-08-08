import type { Request, Response } from 'express';
import type { NextFunction } from 'express';

import { getUserAccountAndEnvironmentFromSession } from '../utils/utils.js';
import { getLogsByEnvironment, errorManager } from '@nangohq/shared';

class ActivityController {
    public async retrieve(req: Request, res: Response, next: NextFunction) {
        try {
            const limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : 20;
            const offset = req.query['offset'] ? parseInt(req.query['offset'] as string) : 0;
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            const logs = await getLogsByEnvironment(environment.id, limit, offset);
            res.send(logs);
        } catch (error) {
            next(error);
        }
    }
}

export default new ActivityController();
