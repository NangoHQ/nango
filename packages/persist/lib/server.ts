import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getLogger, createRoute, requestLoggerMiddleware } from '@nangohq/utils';
import { authMiddleware } from './middleware/auth.middleware.js';
import { routeHandler as getHealthHandler } from './routes/getHealth.js';
import { routeHandler as postLogHandler, path as logsPath } from './routes/environment/environmentId/postLog.js';
import { routeHandler as postRecordsHandler } from './routes/environment/environmentId/connection/connectionId/sync/syncId/job/jobId/postRecords.js';
import { routeHandler as putRecordsHandler } from './routes/environment/environmentId/connection/connectionId/sync/syncId/job/jobId/putRecords.js';
import { routeHandler as deleteRecordsHandler } from './routes/environment/environmentId/connection/connectionId/sync/syncId/job/jobId/deleteRecords.js';
import { routeHandler as getCursorHandler, path as cursorPath } from './routes/environment/environmentId/connection/connectionId/getCursor.js';
import { recordsPath } from './records.js';

const logger = getLogger('Persist');
const maxSizeJsonLog = '100kb';
const maxSizeJsonRecords = '100mb';

export const server = express();

// Log all requests
if (process.env['ENABLE_REQUEST_LOG'] !== 'false') {
    server.use(requestLoggerMiddleware({ logger }));
}

server.use('/environment/:environmentId/*', authMiddleware);
server.use(logsPath, express.json({ limit: maxSizeJsonLog }));
server.use(recordsPath, express.json({ limit: maxSizeJsonRecords }));
server.use(cursorPath, express.json());

createRoute(server, getHealthHandler);
createRoute(server, postLogHandler);
createRoute(server, postRecordsHandler);
createRoute(server, deleteRecordsHandler);
createRoute(server, putRecordsHandler);
createRoute(server, getCursorHandler);

server.use((_req: Request, res: Response, next: NextFunction) => {
    res.status(404);
    next();
});

server.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof Error) {
        if (err.message === 'request entity too large') {
            res.status(400).json({ error: 'Entity too large' });
            return;
        }
        res.status(500).json({ error: err.message });
    } else if (err) {
        res.status(500).json({ error: 'uncaught error' });
    } else {
        next();
    }
});
