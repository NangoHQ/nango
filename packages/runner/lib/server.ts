import { initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import timeout from 'connect-timeout';
import { getJobsUrl, getPersistAPIUrl } from '@nangohq/shared';
import type { NangoProps, RunnerOutput } from '@nangohq/shared';
import { RunnerMonitor } from './monitor.js';
import { exec } from './exec.js';
import { cancel } from './cancel.js';
import superjson from 'superjson';

export const t = initTRPC.create({
    transformer: superjson
});

const router = t.router;
const publicProcedure = t.procedure;

interface RunParams {
    nangoProps: NangoProps;
    isInvokedImmediately: boolean;
    isWebhook: boolean;
    code: string;
    codeParams?: object;
}

const appRouter = router({
    health: healthProcedure(),
    run: runProcedure(),
    cancel: cancelProcedure()
});

export type AppRouter = typeof appRouter;

function healthProcedure() {
    return publicProcedure.query(() => {
        return { status: 'ok' };
    });
}

const runnerId = process.env['RUNNER_ID'] || '';
const jobsServiceUrl = process.env['NOTIFY_IDLE_ENDPOINT']?.replace(/\/idle$/, '') || getJobsUrl(); // TODO: remove legacy NOTIFY_IDLE_ENDPOINT once all runners are updated with JOBS_SERVICE_URL env var
const persistServiceUrl = getPersistAPIUrl();
const usage = new RunnerMonitor({ runnerId, jobsServiceUrl, persistServiceUrl });

function runProcedure() {
    return publicProcedure
        .input((input) => input as RunParams)
        .mutation(async ({ input }): Promise<RunnerOutput> => {
            const { nangoProps, code, codeParams } = input;
            try {
                usage.track(nangoProps);
                return await exec(nangoProps, input.isInvokedImmediately, input.isWebhook, code, codeParams);
            } finally {
                usage.untrack(nangoProps);
            }
        });
}

function cancelProcedure() {
    return publicProcedure
        .input((input) => input as { syncId: string })
        .mutation(({ input }) => {
            return cancel(input.syncId);
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
