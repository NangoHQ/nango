import { AxiosError } from 'axios';
import type { BackoffOptions } from 'exponential-backoff';
import { backOff } from 'exponential-backoff';

interface RetryConfig {
    maxAttempts: number;
    delayMs: number | ((attempt: number) => number);
    retryIf: (error: Error) => boolean;
}

export async function retry<T>(fn: () => T, config: RetryConfig): Promise<T> {
    const { maxAttempts, delayMs, retryIf } = config;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return fn();
        } catch (error) {
            if (attempt < maxAttempts && retryIf(error as Error)) {
                const delay = typeof delayMs === 'number' ? delayMs : delayMs(attempt);
                await new Promise((resolve) => setTimeout(resolve, delay));
            } else {
                throw error;
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

    if (!error.response || !error.status) {
        return false;
    }

    if (error.code && handledCode.includes(error.code)) {
        return true;
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
