import { initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import timeout from 'connect-timeout';
import { getJobsUrl, getPersistAPIUrl } from '@nangohq/shared';
import type { NangoProps } from '@nangohq/shared';
import { RunnerMonitor } from './monitor.js';
import { exec } from './exec.js';
import { abort } from './abort.js';
import superjson from 'superjson';
import { httpFetch, logger } from './utils.js';
import { abortControllers } from './state.js';

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
    start: startProcedure()
});

export type AppRouter = typeof appRouter;

function healthProcedure() {
    return publicProcedure.query(() => {
        return { status: 'ok' };
    });
}

const heartbeatIntervalMs = 30_000;
const runnerId = process.env['RUNNER_ID'] || '';
const jobsServiceUrl = process.env['NOTIFY_IDLE_ENDPOINT']?.replace(/\/idle$/, '') || getJobsUrl(); // TODO: remove legacy NOTIFY_IDLE_ENDPOINT once all runners are updated with JOBS_SERVICE_URL env var
const persistServiceUrl = getPersistAPIUrl();
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
