import type { Request, Response } from 'express';
import type { NextFunction } from 'express';

import { getUserAccountAndEnvironmentFromSession } from '../utils/utils.js';
import { activityFilter, getAllSyncAndActionNames, getTopLevelLogByEnvironment, getLogMessagesForLogs, errorManager } from '@nangohq/shared';

class ActivityController {
    public async retrieve(req: Request, res: Response, next: NextFunction) {
        try {
            const limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : 20;
            const offset = req.query['offset'] ? parseInt(req.query['offset'] as string) : 0;
            const status = req.query['status']?.toString();
            const script = req.query['script']?.toString();
            const connection = req.query['connection']?.toString();
            const integration = req.query['integration']?.toString();
            const date = req.query['date']?.toString();
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            const logs = await getTopLevelLogByEnvironment(environment.id, limit, offset, { status, script, connection, integration, date });
            res.send(logs);
        } catch (error) {
            next(error);
        }
    }

    public async getMessages(req: Request, res: Response, next: NextFunction) {
        try {
            const logIds = req.query['logIds'] ? (req.query['logIds'] as string).split(',').map((logId) => parseInt(logId)) : [];

            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            const logs = await getLogMessagesForLogs(logIds, environment.id);
            res.send(logs);
        } catch (error) {
            next(error);
        }
    }

    public async getPossibleFilters(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            const scripts = await getAllSyncAndActionNames(environment.id);
            const integrations = await activityFilter(environment.id, 'integration');
            const connections = await activityFilter(environment.id, 'connection');
            res.send({ scripts, integrations, connections });
        } catch (error) {
            next(error);
        }
    }
}

export default new ActivityController();
