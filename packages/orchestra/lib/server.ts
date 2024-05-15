import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';
import { getRouteHandler as scheduleHandler } from './routes/v1/schedule.js';
import { handler as healthHandler } from './routes/health.js';
import { getRouteHandler as outputHandler } from './routes/v1/taskId/output.js';
import { getLogger, createRoute } from '@nangohq/utils';
import type { Scheduler } from '@nangohq/scheduler';

const logger = getLogger('Orchestra.server');

export const getServer = ({ scheduler }: { scheduler: Scheduler }): Express => {
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
    createRoute(server, outputHandler(scheduler));

    server.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
        res.status(500).json({ error: `Internal server error: '${err}'` });
        next();
    });
    return server;
};
