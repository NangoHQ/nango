import { initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import timeout from 'connect-timeout';
import { RunnerMonitor } from './monitor.js';
import { exec } from './exec.js';
import { abort } from './abort.js';
import superjson from 'superjson';
import { httpFetch, logger } from './utils.js';
import { abortControllers } from './state.js';
import { runnerId, persistServiceUrl, jobsServiceUrl, heartbeatIntervalMs } from './env.js';
import type { NangoProps } from '@nangohq/types';

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

const usage = new RunnerMonitor({ runnerId, jobsServiceUrl, persistServiceUrl });

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
            usage.track(nangoProps);
            // executing in the background and returning immediately
            // sending the result to the jobs service when done
            setImmediate(async () => {
                const heartbeat = setInterval(async () => {
                    await httpFetch({
                        method: 'POST',
                        url: `${jobsServiceUrl}/tasks/${taskId}/heartbeat`
                    });
                }, heartbeatIntervalMs);
                try {
                    const abortController = new AbortController();
                    if (nangoProps.scriptType == 'sync' && nangoProps.activityLogId) {
                        abortControllers.set(taskId, abortController);
                    }

                    const { error, response: output } = await exec(nangoProps, code, codeParams, abortController);

                    await httpFetch({
                        method: 'PUT',
                        url: `${jobsServiceUrl}/tasks/${taskId}`,
                        data: JSON.stringify({
                            nangoProps,
                            ...(error ? { error } : { output })
                        })
                    });
                } finally {
                    clearInterval(heartbeat);
                    abortControllers.delete(taskId);
                    usage.untrack(nangoProps);
                    logger.info(`Task ${taskId} completed`);
                }
            });
            return true;
        });
}

function abortProcedure() {
    return publicProcedure
        .input((input) => input as { taskId: string })
        .mutation(({ input }) => {
            logger.info('Received cancel', { input });
            return abort(input.taskId);
        });
}

function notifyWhenIdleProcedure() {
    return publicProcedure.mutation(() => {
        logger.info('Received notifyWhenIdle');
        usage.resetIdleMaxDurationMs();
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
