import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';

const t = initTRPC.create();

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
