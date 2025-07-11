import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { Agent, fetch } from 'undici';

import type { AppRouter } from './server.js';
import type { CreateTRPCProxyClient } from '@trpc/client';
import type { RequestInit } from 'undici';

export type ProxyAppRouter = CreateTRPCProxyClient<AppRouter>;

export function getRunnerClient(url: string): ProxyAppRouter {
    return createTRPCProxyClient<AppRouter>({
        transformer: superjson,
        links: [
            httpBatchLink({
                url,
                // @ts-expect-error type discrepancy between undici and node and trpc
                fetch(url: string, options?: RequestInit) {
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
