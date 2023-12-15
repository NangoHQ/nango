import { CreateTRPCProxyClient, createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server.js';

export function getJobsClient(url: string): CreateTRPCProxyClient<AppRouter> {
    return createTRPCProxyClient<AppRouter>({
        links: [httpBatchLink({ url })]
    });
}
