import { CreateTRPCProxyClient, createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server.js';
import superjson from 'superjson';
import { fetch, Agent } from 'undici';

export type ProxyAppRouter = CreateTRPCProxyClient<AppRouter>;

export function getRunnerClient(url: string): ProxyAppRouter {
    return createTRPCProxyClient<AppRouter>({
        transformer: superjson,
        links: [
            httpBatchLink({
                url,
                fetch(url, options) {
                    return fetch(url, {
                        ...options,
                        dispatcher: new Agent({
                            headersTimeout: 0,
                            connectTimeout: 0,
                            bodyTimeout: 0
                        })
                    });
                }
            })
        ]
    });
}
