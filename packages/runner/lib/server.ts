import { initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import timeout from 'connect-timeout';
import type { NangoProps, RunnerOutput } from '@nangohq/shared';
import { exec } from './exec.js';
import { cancel } from './cancel.js';
import superjson from 'superjson';
import { fetch } from 'undici';

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
    return publicProcedure
        .use(async (opts) => {
            pendingRequests.add(opts);
            const next = opts.next();
            pendingRequests.delete(opts);
            lastRequestTime = Date.now();
            return next;
        })
        .query(async () => {
            return { status: 'ok' };
        });
}

const idleMaxDurationMs = parseInt(process.env['IDLE_MAX_DURATION_MS'] || '') || 0;
const runnerId = process.env['RUNNER_ID'] || '';
let lastRequestTime = Date.now();
const pendingRequests = new Set();
const notifyIdleEndpoint = process.env['NOTIFY_IDLE_ENDPOINT'] || '';

function runProcedure() {
    return publicProcedure
        .input((input) => input as RunParams)
        .mutation(async ({ input }): Promise<RunnerOutput> => {
            const { nangoProps, code, codeParams } = input;
            return await exec(nangoProps, input.isInvokedImmediately, input.isWebhook, code, codeParams);
        });
}

function cancelProcedure() {
    return publicProcedure
        .input((input) => input as { syncId: string })
        .mutation(async ({ input }) => {
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

if (idleMaxDurationMs > 0) {
    setInterval(async () => {
        if (pendingRequests.size == 0) {
            const idleTimeMs = Date.now() - lastRequestTime;
            if (idleTimeMs > idleMaxDurationMs) {
                console.log(`Runner '${runnerId}' idle for more than ${idleMaxDurationMs}ms`);
                // calling jobs service to suspend runner
                // using fetch instead of jobs trcp client to avoid circular dependency
                // TODO: use trpc client once jobs doesn't depend on runner
                if (notifyIdleEndpoint.length > 0) {
                    try {
                        const res = await fetch(notifyIdleEndpoint, {
                            method: 'post',
                            headers: {
                                Accept: 'application/json',
                                'Content-Type': 'application/json'
                            },
                            body: superjson.stringify({
                                runnerId,
                                idleTimeMs
                            })
                        });
                        if (res.status !== 200) {
                            console.error(`Error calling ${notifyIdleEndpoint}: ${JSON.stringify(await res.json())}`);
                        }
                    } catch (err) {
                        console.error(`Error calling ${notifyIdleEndpoint}: ${err}`);
                    }
                }
                lastRequestTime = Date.now(); // reset last request time
            }
        }
    }, 10000);
}
