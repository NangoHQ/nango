import express from 'express';

import { serverRequestSizeLimit } from '@nangohq/nango-orchestrator';
import { createRoute, getLogger, requestLoggerMiddleware } from '@nangohq/utils';

import { routeHandler as getHealthHandler } from './routes/getHealth.js';
import { routeHandler as postIdleHandler } from './routes/runners/postIdle.js';
import { routeHandler as postRegisterHandler } from './routes/runners/postRegister.js';
import { routeHandler as putTaskHandler } from './routes/tasks/putTask.js';
import { routeHandler as postHeartbeatHandler } from './routes/tasks/taskId/postHeartbeat.js';

import type { ResDefaultErrors } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

const logger = getLogger('Jobs.server');

export const server = express();

server.use(express.json({ limit: serverRequestSizeLimit }));

// Log all requests
if (process.env['ENABLE_REQUEST_LOG'] !== 'false') {
    server.use(requestLoggerMiddleware({ logger }));
}

createRoute(server, getHealthHandler);
createRoute(server, postIdleHandler);
createRoute(server, postRegisterHandler);
createRoute(server, putTaskHandler);
createRoute(server, postHeartbeatHandler);

server.use((err: any, _req: Request, res: Response<ResDefaultErrors>, _next: NextFunction) => {
    if (err instanceof Error) {
        if (err.message === 'request entity too large') {
            res.status(413).json({ error: { code: 'request_too_large', message: `Request is too large (>${serverRequestSizeLimit})` } });
            return;
        }
    }
    res.status(500).send({ error: { code: 'server_error', message: err.message } });
});
