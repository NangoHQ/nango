import type { MaybePromise } from '@nangohq/types';
import { AxiosError } from 'axios';
import type { BackoffOptions } from 'exponential-backoff';
import { backOff } from 'exponential-backoff';
import { setTimeout } from 'node:timers/promises';

export interface RetryConfig<T = unknown> {
    maxAttempts: number;
    delayMs: number | ((attempt: number) => number);
    retryIf?: (t: T) => boolean;
    retryOnError?: (error: Error) => boolean;
}

export async function retry<T>(fn: () => T, { maxAttempts, delayMs, retryIf = () => false, retryOnError = () => true }: RetryConfig<T>): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const wait = async () => {
            const delay = typeof delayMs === 'number' ? delayMs : delayMs(attempt);
            return setTimeout(delay);
        };
        try {
            const res = await Promise.resolve(fn());
            if (attempt < maxAttempts && retryIf(res)) {
                await wait();
            } else {
                return res;
            }
        } catch (err) {
            if (attempt < maxAttempts && retryOnError(err as Error)) {
                await wait();
            } else {
                throw err;
            }
        }
    }
    throw new Error('unreachable');
}

export interface RetryAttemptArgument {
    attempt: number;
    max: number;
    waited: number;
}
/**
 * Retry flexible (sic) is a simple re-implementation of exponential backoff that:
 * - passes the current attempt to the fn
 * - allow onError to modify the wait time
 *
 * It's mostly for our HTTP retry strategy so we can log the attempts and modify the wait time based on headers
 */
export async function retryFlexible<TReturn>(
    fn: (args: RetryAttemptArgument) => TReturn,
    options: {
        max: number;
        /**
         * Only called if we still have retries available
         */
        onError: (arg: { err: unknown; nextWait: number; attempt: number; max: number }) => MaybePromise<{ retry: boolean; reason: string; wait?: number }>;
    }
): Promise<TReturn> {
    const maxDelay = 60 * 10 * 1000; // 10minutes
    let attempt = -1;
    let lastWait = 0;

    while (attempt < options.max) {
        attempt += 1;
        try {
            const res = await Promise.resolve(fn({ attempt, max: options.max, waited: lastWait }));
            return res;
        } catch (err) {
            if (attempt >= options.max) {
                throw err;
            }

            const nextWait = getExponentialBackoff(attempt, maxDelay);
            const on = await options.onError({ err, nextWait, max: options.max, attempt: attempt + 1 });
            if (!on.retry) {
                throw err;
            }

            lastWait = on.wait ?? nextWait;
            await setTimeout(lastWait);
        }
    }
    throw new Error('unreachable');
}

/**
 * Get exponential backoff with a cap
 * Base 2, minimum 3s
 */
export function getExponentialBackoff(attempt: number, maxDelay: number): number {
    return Math.min(3000 * 2 ** attempt, maxDelay);
}

export async function retryWithBackoff<T extends () => any>(fn: T, options?: BackoffOptions): Promise<ReturnType<T>> {
    return await backOff(fn, { numOfAttempts: 5, ...options });
}

export const networkError = ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'];
export function httpRetryStrategy(error: unknown, _attemptNumber: number): boolean {
    if (!(error instanceof AxiosError)) {
        // debatable
        return false;
    }

    if (error.code && networkError.includes(error.code)) {
        return true;
    }

    if (!error.response || !error.status) {
        return false;
    }

    if (error.status >= 499) {
        return true;
    }
    if (error.status === 403 && error.response.headers['x-ratelimit-remaining'] && error.response.headers['x-ratelimit-remaining'] === '0') {
        // Note that Github issues a 403 for both rate limits and improper scopes
        return true;
    }
    if (error.status === 429) {
        return true;
    }

    return false;
}
