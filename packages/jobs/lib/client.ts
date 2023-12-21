import { CreateTRPCProxyClient, createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server.js';
import superjson from 'superjson';

export function getJobsClient(url: string): CreateTRPCProxyClient<AppRouter> {
    return createTRPCProxyClient<AppRouter>({
        transformer: superjson,
        links: [httpBatchLink({ url })]
    });
}
