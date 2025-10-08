import express from 'express';

import { createRoute } from '@nangohq/utils';

import { authMiddleware } from './middleware/auth.middleware.js';
import { recordsPath } from './records.js';
import { route as getCursorRoute, routeHandler as getCursorHandler } from './routes/environment/environmentId/connection/connectionId/getCursor.js';
import { route as getRecordsRoute, routeHandler as getRecordsHandler } from './routes/environment/environmentId/connection/connectionId/getRecords.js';
import {
    route as deleteOutdatedRecordsRoute,
    routeHandler as deleteOutdatedRecordsHandler
} from './routes/environment/environmentId/connection/connectionId/sync/syncId/job/jobId/deleteOutdatedRecords.js';
import { routeHandler as deleteRecordsHandler } from './routes/environment/environmentId/connection/connectionId/sync/syncId/job/jobId/deleteRecords.js';
import { routeHandler as postRecordsHandler } from './routes/environment/environmentId/connection/connectionId/sync/syncId/job/jobId/postRecords.js';
import { routeHandler as putRecordsHandler } from './routes/environment/environmentId/connection/connectionId/sync/syncId/job/jobId/putRecords.js';
import { routeHandler as postLogHandler } from './routes/environment/environmentId/postLog.js';
import { routeHandler as getHealthHandler } from './routes/getHealth.js';

import type { ApiError } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

const maxSizeJsonLog = '100kb';
const maxSizeJsonRecords = '100mb';

export const server = express();

server.set('query parser', 'extended');

server.use('/environment/:environmentId/*splat', authMiddleware);
server.use('/environment/:environmentId/log', express.json({ limit: maxSizeJsonLog }));
server.use(recordsPath, express.json({ limit: maxSizeJsonRecords }));
server.use(getCursorRoute.path, express.json());
server.use(getRecordsRoute.path, express.json());
server.use(deleteOutdatedRecordsRoute.path, express.json());

createRoute(server, getHealthHandler);
createRoute(server, postLogHandler);
createRoute(server, postRecordsHandler);
createRoute(server, deleteRecordsHandler);
createRoute(server, deleteOutdatedRecordsHandler);
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
