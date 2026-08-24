import express from 'express';

import { INTERNAL_SERVICE_AUDIENCE_JOBS, internalServiceAuthMiddleware, requireFleetAuth, requireTaskBoundAuth } from '@nangohq/internal-auth';
import { serverRequestSizeLimit } from '@nangohq/nango-orchestrator';
import { createRoute } from '@nangohq/utils';

import { envs } from './env.js';
import { routeHandler as getHealthHandler } from './routes/getHealth.js';
import { routeHandler as postIdleHandler } from './routes/runners/postIdle.js';
import { routeHandler as postRegisterHandler } from './routes/runners/postRegister.js';
import { routeHandler as putTaskHandler } from './routes/tasks/putTask.js';
import { routeHandler as postHeartbeatHandler } from './routes/tasks/taskId/postHeartbeat.js';

import type { ResDefaultErrors } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

export const server = express();

createRoute(server, getHealthHandler);
server.use(internalServiceAuthMiddleware({ audience: INTERNAL_SERVICE_AUDIENCE_JOBS, envs }));
server.use(express.json({ limit: serverRequestSizeLimit }));
createRoute(server, postIdleHandler, [requireFleetAuth(envs, 'idle')]);
createRoute(server, postRegisterHandler, [requireFleetAuth(envs, 'register')]);
createRoute(server, putTaskHandler, [requireTaskBoundAuth(envs)]);
createRoute(server, postHeartbeatHandler, [requireTaskBoundAuth(envs)]);

server.use((err: any, _req: Request, res: Response<ResDefaultErrors>, _next: NextFunction) => {
    if (err instanceof Error) {
        if (err.message === 'request entity too large') {
            res.status(413).json({ error: { code: 'request_too_large', message: `Request is too large (>${serverRequestSizeLimit})` } });
            return;
        }
    }
    res.status(500).send({ error: { code: 'server_error', message: err.message } });
});
