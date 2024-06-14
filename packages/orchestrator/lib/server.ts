import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';
import { routeHandler as postImmediateHandler } from './routes/v1/postImmediate.js';
import { routeHandler as postRecurringHandler } from './routes/v1/postRecurring.js';
import { routeHandler as putRecurringHandler } from './routes/v1/putRecurring.js';
import { routeHandler as postScheduleRunHandler } from './routes/v1/schedules/postRun.js';
import { routeHandler as postTasksSearchHandler } from './routes/v1/tasks/postSearch.js';
import { routeHandler as postSchedulesSearchHandler } from './routes/v1/schedules/postSearch.js';
import { routeHandler as postDequeueHandler } from './routes/v1/postDequeue.js';
import { routeHandler as putTaskHandler } from './routes/v1/tasks/putTaskId.js';
import { routeHandler as getHealthHandler } from './routes/getHealth.js';
import { routeHandler as getOutputHandler } from './routes/v1/tasks/taskId/getOutput.js';
import { routeHandler as postHeartbeatHandler } from './routes/v1/tasks/taskId/postHeartbeat.js';
import { getLogger, createRoute } from '@nangohq/utils';
import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError } from '@nangohq/types';
import type EventEmitter from 'node:events';

const logger = getLogger('Orchestrator.server');

export const getServer = (scheduler: Scheduler, eventEmmiter: EventEmitter): Express => {
    const server = express();

    server.use(express.json({ limit: '10mb' }));

    // Logging middleware
    server.use((req: Request, res: Response, next: NextFunction) => {
        const originalSend = res.send;
        res.send = function (body: any) {
            if (res.statusCode >= 400) {
                logger.error(`${req.method} ${req.path} ${res.statusCode} -> ${JSON.stringify(body)}`);
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

    createRoute(server, getHealthHandler);
    createRoute(server, postImmediateHandler(scheduler));
    createRoute(server, postRecurringHandler(scheduler));
    createRoute(server, postScheduleRunHandler(scheduler));
    createRoute(server, putRecurringHandler(scheduler));
    createRoute(server, postTasksSearchHandler(scheduler));
    createRoute(server, postSchedulesSearchHandler(scheduler));
    createRoute(server, putTaskHandler(scheduler));
    createRoute(server, getOutputHandler(scheduler, eventEmmiter));
    createRoute(server, postHeartbeatHandler(scheduler));
    createRoute(server, postDequeueHandler(scheduler, eventEmmiter));

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
