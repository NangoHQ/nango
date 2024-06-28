import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import superjson from 'superjson';
import { z } from 'zod';
import { suspendRunner } from './runner/runner.js';
import { getLogger } from '@nangohq/utils';

const logger = getLogger('Jobs');

export const t = initTRPC.create({
    transformer: superjson
});

const router = t.router;
const publicProcedure = t.procedure;
// TODO: add logging middleware

const appRouter = router({
    health: healthProcedure(),
    idle: idleProcedure()
});

export type AppRouter = typeof appRouter;

export const server = createHTTPServer({
    router: appRouter
});

function healthProcedure() {
    return publicProcedure.query(() => {
        return { status: 'ok' };
    });
}

function idleProcedure() {
    return publicProcedure.input(z.object({ runnerId: z.string().min(1), idleTimeMs: z.number() })).mutation(async ({ input }) => {
        const { runnerId, idleTimeMs } = input;
        logger.info(`[runner ${runnerId}]: idle for ${idleTimeMs}ms. Suspending...`);
        await suspendRunner(runnerId);
        return { status: 'ok' };
    });
}
