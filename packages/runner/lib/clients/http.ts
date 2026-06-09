import { networkError, retryWithBackoff, stringifyError } from '@nangohq/utils';

import { logger } from '../logger.js';

function getErrorCode(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null) return undefined;
    if ('code' in error && typeof (error as any).code === 'string') return (error as any).code;
    if ('cause' in error) return getErrorCode((error as any).cause);
    return undefined;
}

function shouldRetry(error: unknown, response?: Response): boolean {
    const code = getErrorCode(error);
    if (code && networkError.includes(code)) {
        return true;
    }

    if (response) {
        if (response.status >= 500 || response.status === 429) {
            return true;
        }
    }

    return false;
}

export interface HttpFetchOptions extends RequestInit {
    userAgent?: string;
}

export interface BackoffOptions {
    startingDelay?: number;
    timeMultiple?: number;
    numOfAttempts?: number;
}

export async function httpFetch(url: string | URL, options?: HttpFetchOptions, backoffOptions?: BackoffOptions): Promise<Response> {
    const { userAgent, ...requestInit } = options ?? {};

    const method = requestInit.method || 'GET';

    const headers = new Headers(requestInit.headers);
    if (userAgent) {
        headers.set('User-Agent', userAgent);
    }

    const fetchOptions: RequestInit = {
        ...requestInit,
        headers
    };

    try {
        return await retryWithBackoff(async () => {
            let res: Response;
            try {
                res = await fetch(url, fetchOptions);
            } catch (err) {
                if (shouldRetry(err)) {
                    throw err;
                }

                // Non-retryable network error
                return new Response(JSON.stringify({ error: stringifyError(err, { cause: true }) }), {
                    status: 502,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            if (!res.ok) {
                logger.error(`${method} ${url.toString()} -> ${res.status} ${res.statusText}`);
            }

            if (shouldRetry(null, res)) {
                throw new Error(`${method} ${url.toString()} -> ${res.status} ${res.statusText}`);
            }

            return res;
        }, backoffOptions);
    } catch (err) {
        // All retries exhausted
        return new Response(JSON.stringify({ error: stringifyError(err, { cause: true }) }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
