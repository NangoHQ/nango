import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { routeHandler as getHealthHandler } from './routes/getHealth.js';
import { routeHandler as postIdleHandler } from './routes/postIdle.js';
import { routeHandler as putTaskHandler } from './routes/tasks/putTask.js';
import { routeHandler as postHeartbeatHandler } from './routes/tasks/taskId/postHeartbeat.js';
import { getLogger, createRoute, requestLoggerMiddleware } from '@nangohq/utils';
import type { ResDefaultErrors } from '@nangohq/types';

const logger = getLogger('Jobs.server');

export const server = express();

server.use(express.json({ limit: '10mb' }));

// Log all requests
if (process.env['ENABLE_REQUEST_LOG'] !== 'false') {
    server.use(requestLoggerMiddleware({ logger }));
}

createRoute(server, getHealthHandler);
createRoute(server, postIdleHandler);
createRoute(server, putTaskHandler);
createRoute(server, postHeartbeatHandler);

server.use((err: any, _req: Request, res: Response<ResDefaultErrors>, _next: NextFunction) => {
    res.status(500).send({ error: { code: 'server_error', message: err.message } });
});
