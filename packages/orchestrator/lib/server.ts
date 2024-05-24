import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';
import { getRouteHandler as scheduleHandler } from './routes/v1/schedule.js';
import { handler as healthHandler } from './routes/health.js';
import { getRouteHandler as outputHandler } from './routes/v1/task/taskId/output.js';
import { getLogger, createRoute } from '@nangohq/utils';
import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError } from '@nangohq/types';
import type EventEmitter from 'node:events';

const logger = getLogger('Orchestrator.server');

export const getServer = (scheduler: Scheduler, eventEmmiter: EventEmitter): Express => {
    const server = express();

    server.use(express.json({ limit: '100kb' }));

    // Logging middleware
    server.use((req: Request, res: Response, next: NextFunction) => {
        const originalSend = res.send;
        res.send = function (body: any) {
            if (res.statusCode >= 400) {
                logger.error(`${req.method} ${req.path} ${res.statusCode} -> ${body}`);
            }
            originalSend.call(this, body) as any;
            return this;
        };
        next();
        if (res.statusCode < 400) {
            logger.info(`${req.method} ${req.path} -> ${res.statusCode}`);
        }
    });

    //TODO: add auth middleware

    createRoute(server, healthHandler);
    createRoute(server, scheduleHandler(scheduler));
    createRoute(server, outputHandler(scheduler, eventEmmiter));

    server.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
        res.status(500).json({ error: `Internal server error: '${err}'` });
        next();
    });

    server.use((err: any, _req: Request, res: Response<ApiError<'invalid_json' | 'internal_error'>>, _next: any) => {
        if (err instanceof SyntaxError && 'body' in err && 'type' in err && err.type === 'entity.parse.failed') {
            res.status(400).send({ error: { code: 'invalid_json', message: err.message } });
            return;
        }
        res.status(500).send({ error: { code: 'internal_error', message: err.message } });
    });

    return server;
};
