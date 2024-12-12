import { AxiosError } from 'axios';
import type { BackoffOptions } from 'exponential-backoff';
import { backOff } from 'exponential-backoff';

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
            return new Promise((resolve) => setTimeout(resolve, delay));
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

export async function retryWithBackoff<T extends () => any>(fn: T, options?: BackoffOptions): Promise<ReturnType<T>> {
    return await backOff(fn, { numOfAttempts: 5, ...options });
}

const handledCode = ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'];
export function httpRetryStrategy(error: unknown, _attemptNumber: number): boolean {
    if (!(error instanceof AxiosError)) {
        // debatable
        return false;
    }

    if (error.code && handledCode.includes(error.code)) {
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
