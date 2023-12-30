import { initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import timeout from 'connect-timeout';
import type { NangoProps } from '@nangohq/shared';
import { exec } from './exec.js';
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
    run: runProcedure()
});

export type AppRouter = typeof appRouter;

function healthProcedure() {
    return publicProcedure.query(async () => {
        return { status: 'ok' };
    });
}

function runProcedure() {
    return publicProcedure
        .input((input) => input as RunParams)
        .mutation(async ({ input }) => {
            const { nangoProps, code, codeParams } = input;
            return await exec(nangoProps, input.isInvokedImmediately, input.isWebhook, code, codeParams);
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
