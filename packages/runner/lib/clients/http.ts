import { retryWithBackoff } from '@nangohq/utils';

import { logger } from '../logger.js';

export async function httpFetch(
    url: string | URL,
    init?: RequestInit,
    backoffOptions?: {
        startingDelay?: number;
        timeMultiple?: number;
        numOfAttempts?: number;
    }
): Promise<Response> {
    try {
        const response = await retryWithBackoff(async () => {
            let res: Response;

            try {
                res = await fetch(url, init);
            } catch (err) {
                logger.error(`Network error: ${init?.method || 'GET'} ${url.toString()} -> ${(err as Error).message}`);
                // Retry on network errors
                throw err;
            }

            if (!res.ok) {
                logger.error(`${init?.method || 'GET'} ${url.toString()} -> ${res.status} ${res.statusText}`);
            }

            // Retry only on 5xx or 429 responses
            if (res.status >= 500 || res.status === 429) {
                throw new Error(`${init?.method || 'GET'} ${url.toString()} -> ${res.status} ${res.statusText}`);
            }

            return res;
        }, backoffOptions);

        return response;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ error: message }), {
            status: 599,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
