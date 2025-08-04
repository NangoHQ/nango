import express from 'express';

import { createRoute, getLogger, requestLoggerMiddleware } from '@nangohq/utils';

import { serverRequestSizeLimit } from './constants.js';
import { routeHandler as getHealthHandler } from './routes/getHealth.js';
import { routeHandler as postDequeueHandler } from './routes/v1/postDequeue.js';
import { routeHandler as postImmediateHandler } from './routes/v1/postImmediate.js';
import { routeHandler as postRecurringHandler } from './routes/v1/postRecurring.js';
import { routeHandler as putRecurringHandler } from './routes/v1/putRecurring.js';
import { routeHandler as getRetryOutputHandler } from './routes/v1/retries/retryKey/getOutput.js';
import { routeHandler as postScheduleRunHandler } from './routes/v1/schedules/postRun.js';
import { routeHandler as postSchedulesSearchHandler } from './routes/v1/schedules/postSearch.js';
import { routeHandler as postTasksSearchHandler } from './routes/v1/tasks/postSearch.js';
import { routeHandler as putTaskHandler } from './routes/v1/tasks/putTaskId.js';
import { routeHandler as getOutputHandler } from './routes/v1/tasks/taskId/getOutput.js';
import { routeHandler as postHeartbeatHandler } from './routes/v1/tasks/taskId/postHeartbeat.js';

import type { Scheduler } from '@nangohq/scheduler';
import type { ApiError } from '@nangohq/types';
import type { Express, NextFunction, Request, Response } from 'express';
import type EventEmitter from 'node:events';

const logger = getLogger('Orchestrator.server');

export const getServer = (scheduler: Scheduler, eventEmmiter: EventEmitter): Express => {
    const server = express();

    server.use(express.json({ limit: serverRequestSizeLimit }));

    // Log all requests
    if (process.env['ENABLE_REQUEST_LOG'] !== 'false') {
        server.use(requestLoggerMiddleware({ logger }));
    }

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
    createRoute(server, getRetryOutputHandler(scheduler));

    server.use((err: any, _req: Request, res: Response<ApiError<'invalid_json' | 'internal_error' | 'payload_too_big'>>, _next: NextFunction) => {
        if (err instanceof SyntaxError && 'body' in err && 'type' in err && err.type === 'entity.parse.failed') {
            res.status(400).send({ error: { code: 'invalid_json', message: err.message } });
            return;
        } else if (err instanceof Error) {
            if (err.message === 'request entity too large') {
                res.status(400).json({ error: { code: 'payload_too_big', message: 'Payload is too big' } });
                return;
            }
        }

        res.status(500).send({ error: { code: 'internal_error', message: err.message } });
    });

    return server;
};
