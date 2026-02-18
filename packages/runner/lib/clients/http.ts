import { Agent } from 'node:https';

import { networkError, retryWithBackoff, stringifyError } from '@nangohq/utils';

import { logger } from '../logger.js';

function hasErrorCode(error: unknown): error is { code: string } {
    return typeof error === 'object' && error !== null && 'code' in error && typeof (error as any).code === 'string';
}

function shouldRetry(error: unknown, response?: Response): boolean {
    if (hasErrorCode(error) && networkError.includes(error.code)) {
        return true;
    }

    if (response) {
        if (response.status >= 500 || response.status === 429) {
            return true;
        }
    }

    return false;
}

export interface HttpFetchOptions extends Omit<RequestInit, 'keepalive'> {
    userAgent?: string;
    keepAlive?: boolean;
}

export interface BackoffOptions {
    startingDelay?: number;
    timeMultiple?: number;
    numOfAttempts?: number;
}

let keepAliveAgent: Agent | null = null;
function getKeepAliveAgent(): Agent {
    if (!keepAliveAgent) {
        keepAliveAgent = new Agent({ keepAlive: true });
    }
    return keepAliveAgent;
}

export async function httpFetch(url: string | URL, options?: HttpFetchOptions, backoffOptions?: BackoffOptions): Promise<Response> {
    const { userAgent, keepAlive = true, ...requestInit } = options ?? {};

    const method = requestInit.method || 'GET';

    const headers = new Headers(requestInit.headers);
    if (userAgent) {
        headers.set('User-Agent', userAgent);
    }

    const fetchOptions: RequestInit & { dispatcher?: Agent } = {
        ...requestInit,
        headers,
        keepalive: keepAlive
    };

    if (keepAlive && url.toString().startsWith('https')) {
        fetchOptions.dispatcher = getKeepAliveAgent();
    }

    try {
        return await retryWithBackoff(async () => {
            try {
                const res = await fetch(url, fetchOptions);

                if (!res.ok) {
                    logger.error(`${method} ${url.toString()} -> ${res.status} ${res.statusText}`);
                }

                if (shouldRetry(null, res)) {
                    throw new Error(`${method} ${url.toString()} -> ${res.status} ${res.statusText}`);
                }

                return res;
            } catch (err) {
                if (shouldRetry(err)) {
                    throw err;
                }

                // Non-retryable error
                return new Response(JSON.stringify({ error: stringifyError(err) }), {
                    status: 502,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }, backoffOptions);
    } catch (err) {
        // All retries exhausted
        return new Response(JSON.stringify({ error: stringifyError(err) }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
