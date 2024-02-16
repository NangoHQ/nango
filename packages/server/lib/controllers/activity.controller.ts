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
            const rawLogIds = req.query['logIds'];
            if (typeof rawLogIds !== 'string') {
                res.status(400).send({ message: 'Missing logsIds parameter' });
                return;
            }

            const logIds = new Set<number>();
            // Deduplicate and exclude NaN
            for (const logId of rawLogIds.split(',')) {
                const parsed = parseInt(logId, 10);
                if (parsed) {
                    logIds.add(parsed);
                }
            }
            if (logIds.size <= 0) {
                res.send([]);
                return;
            }

            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }

            const { environment } = response;
            const logs = await getLogMessagesForLogs(Array.from(logIds.values()), environment.id);
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
            const integrations = await activityFilter(environment.id, 'provider');
            const connections = await activityFilter(environment.id, 'connection_id');
            res.send({ scripts, integrations, connections });
        } catch (error) {
            next(error);
        }
    }
}

export default new ActivityController();
