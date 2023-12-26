import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import superjson from 'superjson';

export const t = initTRPC.create({
    transformer: superjson
});

const router = t.router;
const publicProcedure = t.procedure;
// TODO: add logging middleware

const appRouter = router({
    health: healthProcedure()
});

export type AppRouter = typeof appRouter;

export const server = createHTTPServer({
    router: appRouter
});

function healthProcedure() {
    return publicProcedure.query(async () => {
        return { status: 'ok' };
    });
}
