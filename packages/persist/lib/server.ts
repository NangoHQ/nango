import express from 'express';

import { createRoute, getLogger, requestLoggerMiddleware } from '@nangohq/utils';

import { authMiddleware } from './middleware/auth.middleware.js';
import { recordsPath } from './records.js';
import { path as cursorPath, routeHandler as getCursorHandler } from './routes/environment/environmentId/connection/connectionId/getCursor.js';
import { path as getRecordsPath, routeHandler as getRecordsHandler } from './routes/environment/environmentId/connection/connectionId/getRecords.js';
import { routeHandler as deleteRecordsHandler } from './routes/environment/environmentId/connection/connectionId/sync/syncId/job/jobId/deleteRecords.js';
import { routeHandler as postRecordsHandler } from './routes/environment/environmentId/connection/connectionId/sync/syncId/job/jobId/postRecords.js';
import { routeHandler as putRecordsHandler } from './routes/environment/environmentId/connection/connectionId/sync/syncId/job/jobId/putRecords.js';
import { routeHandler as postLogHandler } from './routes/environment/environmentId/postLog.js';
import { routeHandler as getHealthHandler } from './routes/getHealth.js';

import type { ApiError } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

const logger = getLogger('Persist');
const maxSizeJsonLog = '100kb';
const maxSizeJsonRecords = '100mb';

export const server = express();

// Log all requests
if (process.env['ENABLE_REQUEST_LOG'] !== 'false') {
    server.use(requestLoggerMiddleware({ logger }));
}

server.use('/environment/:environmentId/*splat', authMiddleware);
server.use('/environment/:environmentId/log', express.json({ limit: maxSizeJsonLog }));
server.use(recordsPath, express.json({ limit: maxSizeJsonRecords }));
server.use(cursorPath, express.json());
server.use(getRecordsPath, express.json());

createRoute(server, getHealthHandler);
createRoute(server, postLogHandler);
createRoute(server, postRecordsHandler);
createRoute(server, deleteRecordsHandler);
createRoute(server, putRecordsHandler);
createRoute(server, getCursorHandler);
createRoute(server, getRecordsHandler);

server.use((_req: Request, res: Response, next: NextFunction) => {
    res.status(404);
    next();
});

server.use((err: unknown, _req: Request, res: Response<ApiError<'request_too_large' | 'server_error'>>, next: NextFunction) => {
    if (err instanceof Error) {
        if (err.message === 'request entity too large') {
            res.status(400).json({ error: { code: 'request_too_large', message: 'Entity too large' } });
            return;
        }
        res.status(500).json({ error: { code: 'server_error', message: err.message } });
    } else if (err) {
        res.status(500).json({ error: { code: 'server_error' } });
    } else {
        next();
    }
});
