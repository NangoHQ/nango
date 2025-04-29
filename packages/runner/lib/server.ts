import { initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import timeout from 'connect-timeout';
import { RunnerMonitor } from './monitor.js';
import superjson from 'superjson';
import { envs, jobsServiceUrl } from './env.js';
import type { NangoProps } from '@nangohq/types';
import { logger } from './logger.js';
import { RunnerWorker } from './workers/worker.js';
import { Locks } from './sdk/locks.js';

export const t = initTRPC.create({
    transformer: superjson
});

const router = t.router;
const publicProcedure = t.procedure;

interface StartParams {
    taskId: string;
    nangoProps: NangoProps;
    code: string;
    codeParams?: object;
}

const appRouter = router({
    health: healthProcedure(),
    abort: abortProcedure(),
    start: startProcedure(),
    notifyWhenIdle: notifyWhenIdleProcedure()
});

export type AppRouter = typeof appRouter;

function healthProcedure() {
    return publicProcedure.query(() => {
        return { status: 'ok' };
    });
}

const monitor = new RunnerMonitor({ runnerId: envs.RUNNER_NODE_ID });
const locks = Locks.create();

function startProcedure() {
    return publicProcedure
        .input((input) => input as StartParams)
        .mutation(({ input }): boolean => {
            const { taskId, nangoProps, code, codeParams } = input;
            logger.info('Received task', {
                taskId: taskId,
                env: nangoProps.environmentId,
                connectionId: nangoProps.connectionId,
                syncId: nangoProps.syncId,
                version: nangoProps.syncConfig.version,
                fileLocation: nangoProps.syncConfig.file_location,
                input: codeParams
            });
            const worker = new RunnerWorker({
                taskId,
                jobsServiceUrl,
                heartbeatIntervalMs: envs.RUNNER_HEARTBEAT_INTERVAL_MS,
                memoryCheckIntervalMs: envs.RUNNER_MEMORY_CHECK_INTERVAL_MS,
                locksBuffer: locks.getBuffer(),
                nangoProps,
                code,
                codeParams
            });
            monitor.track(worker);
            worker.on('error', (err) => {
                logger.error(`Task ${taskId} failed`, { err });
            });
            worker.on('exit', (exitCode) => {
                if (exitCode) {
                    logger.error(`Task ${taskId} exited with code ${exitCode}`);
                }
                monitor.untrack(worker);
            });
            worker.start();

            return true;
        });
}

function abortProcedure() {
    return publicProcedure
        .input((input) => input as { taskId: string })
        .mutation(({ input }) => {
            logger.info('Received cancel', { input });
            return monitor.abort(input.taskId);
        });
}

function notifyWhenIdleProcedure() {
    return publicProcedure.mutation(() => {
        logger.info('Received notifyWhenIdle');
        monitor.resetIdleMaxDurationMs();
        return true;
    });
}

export const server = express();
server.use(timeout('24h'));
server.use(
    '/',
    trpcExpress.createExpressMiddleware({
        router: appRouter,
        createContext: () => ({})
    })
);
server.use(haltOnTimedout);

function haltOnTimedout(req: Request, _res: Response, next: NextFunction) {
    if (!req.timedout) next();
}
