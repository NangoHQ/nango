import type { Request, Response, NextFunction } from 'express';

import { activityFilter, getAllSyncAndActionNames, getTopLevelLogByEnvironment, getLogMessagesForLogs } from '@nangohq/shared';
import type { RequestLocals } from '../utils/express.js';

class ActivityController {
    public async retrieve(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : 20;
            const offset = req.query['offset'] ? parseInt(req.query['offset'] as string) : 0;
            const status = req.query['status']?.toString();
            const script = req.query['script']?.toString();
            const connection = req.query['connection']?.toString();
            const integration = req.query['integration']?.toString();
            const date = req.query['date']?.toString();

            const { environment } = res.locals;

            const logs = await getTopLevelLogByEnvironment(environment.id, limit, offset, { status, script, connection, integration, date });
            res.send(logs);
        } catch (error) {
            next(error);
        }
    }

    public async getMessages(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
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

            const { environment } = res.locals;
            const logs = await getLogMessagesForLogs(Array.from(logIds.values()), environment.id);
            res.send(logs);
        } catch (error) {
            next(error);
        }
    }

    public async getPossibleFilters(_: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment } = res.locals;

            const scripts = await getAllSyncAndActionNames(environment.id);
            const integrations = await activityFilter(environment.id, 'provider_config_key');
            const connections = await activityFilter(environment.id, 'connection_id');
            res.send({ scripts, integrations, connections });
        } catch (error) {
            next(error);
        }
    }
}

export default new ActivityController();
