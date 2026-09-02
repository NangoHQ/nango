import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { Agent, fetch } from 'undici';

import { getInternalAuthBearerHeaderIfPresent } from '@nangohq/internal-auth';
import { getInternalTlsOptions } from '@nangohq/utils';

import type { AppRouter } from './server.js';
import type { CreateTRPCProxyClient } from '@trpc/client';
import type { RequestInit } from 'undici';

export type ProxyAppRouter = CreateTRPCProxyClient<AppRouter>;

interface RunnerHttpOpts {
    headersTimeoutMs: number;
    connectTimeoutMs: number;
    responseTimeoutMs: number;
}

export type RunnerClientAuth = {
    token?: string | null | undefined;
};

// A new client is built for every task, so the agent has to outlive it or no connection is ever
// reused and every call pays a fresh handshake.
const agents = new Map<string, Agent>();

function getAgent(httpOpts: RunnerHttpOpts): Agent {
    const key = `${httpOpts.headersTimeoutMs}:${httpOpts.connectTimeoutMs}:${httpOpts.responseTimeoutMs}`;
    let agent = agents.get(key);
    if (!agent) {
        const tls = getInternalTlsOptions();
        agent = new Agent({
            headersTimeout: httpOpts.headersTimeoutMs,
            connectTimeout: httpOpts.connectTimeoutMs,
            bodyTimeout: httpOpts.responseTimeoutMs,
            ...(tls ? { connect: tls } : {})
        });
        agents.set(key, agent);
    }
    return agent;
}

export function getRunnerClient(url: string, httpOpts: RunnerHttpOpts, auth?: RunnerClientAuth): ProxyAppRouter {
    const dispatcher = getAgent(httpOpts);
    return createTRPCProxyClient<AppRouter>({
        transformer: superjson,
        links: [
            httpBatchLink({
                url,
                headers: getInternalAuthBearerHeaderIfPresent(auth?.token),
                // @ts-expect-error type discrepancy between undici and node and trpc
                fetch(url: string, options?: RequestInit) {
                    return fetch(url, {
                        ...options,
                        dispatcher
                    });
                }
            })
        ]
    });
}
