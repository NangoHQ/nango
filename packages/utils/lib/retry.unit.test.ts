import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getExponentialBackoff, retry, retryFlexible } from './retry.js';

// Avoid actually waiting in tests, and let us assert on the wait durations passed through.
vi.mock('node:timers/promises', () => ({
    setTimeout: vi.fn().mockResolvedValue(undefined)
}));

afterEach(() => {
    vi.mocked(delay).mockClear();
});

describe('retry', () => {
    it('should retry', async () => {
        let count = 0;
        const result = await retry(
            () => {
                count++;
                if (count < 3) {
                    throw new Error('my error');
                }
                return count;
            },
            {
                maxAttempts: 3,
                maxWaitMs: Infinity,
                delayMs: () => 0
            }
        );
        expect(result).toEqual(3);
    });

    it('should throw error after max attempts', async () => {
        let count = 0;
        try {
            await retry(
                () => {
                    count++;
                    throw new Error('my error');
                },
                {
                    maxAttempts: 3,
                    maxWaitMs: Infinity,
                    delayMs: () => 0
                }
            );
        } catch (err: any) {
            expect(err.message).toEqual('my error');
        }
        expect(count).toBe(3);
    });

    it('should not retry if result condition is false ', async () => {
        let count = 0;
        try {
            await retry(
                () => {
                    count++;
                    return count;
                },
                {
                    maxAttempts: 3,
                    maxWaitMs: Infinity,
                    delayMs: () => 0,
                    retryIf: (n) => n == -1
                }
            );
        } catch (err: any) {
            expect(err.message).toEqual('my error');
        }
        expect(count).toBe(1);
    });

    it('should not retry if error condition is false ', async () => {
        let count = 0;
        try {
            await retry(
                () => {
                    count++;
                    if (count < 3) {
                        throw new Error('my error');
                    }
                    return count;
                },
                {
                    maxAttempts: 3,
                    maxWaitMs: Infinity,
                    delayMs: () => 0,
                    retryOnError: (error) => error.message === 'another error'
                }
            );
        } catch (err: any) {
            expect(err.message).toEqual('my error');
        }
        expect(count).toBe(1);
    });

    it('should cap the delay at maxWaitMs', async () => {
        let count = 0;
        await retry(
            () => {
                count++;
                if (count < 2) {
                    throw new Error('my error');
                }
                return count;
            },
            {
                maxAttempts: 2,
                maxWaitMs: 5,
                delayMs: () => 200
            }
        );
        expect(delay).toHaveBeenCalledWith(5);
    });
});

describe('getExponentialBackoff', () => {
    it('should grow exponentially with a base of 3s', () => {
        expect(getExponentialBackoff(0, Infinity)).toBe(3000);
        expect(getExponentialBackoff(1, Infinity)).toBe(6000);
        expect(getExponentialBackoff(2, Infinity)).toBe(12000);
    });

    it('should cap at maxWaitMs', () => {
        expect(getExponentialBackoff(10, 5000)).toBe(5000);
    });
});

describe('retryFlexible', () => {
    it('should cap the onError-provided wait at maxWaitMs', async () => {
        let attempt = 0;

        const result = await retryFlexible(
            () => {
                attempt += 1;
                if (attempt < 2) {
                    throw new Error('boom');
                }
                return 'done';
            },
            {
                max: 3,
                maxWaitMs: 1000,
                // Simulates an unreasonably long wait (e.g. from a Retry-After header), which should be capped.
                onError: () => ({ retry: true, reason: 'test', wait: 3_600_000 })
            }
        );

        expect(result).toBe('done');
        expect(delay).toHaveBeenLastCalledWith(1000);
    });

    it('should fall back to exponential backoff, capped at maxWaitMs, when onError has no explicit wait', async () => {
        let attempt = 0;

        await retryFlexible(
            () => {
                attempt += 1;
                if (attempt < 2) {
                    throw new Error('boom');
                }
                return 'done';
            },
            {
                max: 3,
                maxWaitMs: 1000,
                onError: () => ({ retry: true, reason: 'test' })
            }
        );

        // getExponentialBackoff(0, 1000) === 1000 since the base 3000ms attempt would otherwise exceed maxWaitMs
        expect(delay).toHaveBeenLastCalledWith(1000);
    });

    it('should fail fast when onError returns retry: false', async () => {
        await expect(
            retryFlexible(
                () => {
                    throw new Error('boom');
                },
                {
                    max: 5,
                    maxWaitMs: Infinity,
                    onError: () => ({ retry: false, reason: 'not_retryable' })
                }
            )
        ).rejects.toThrow('boom');
    });
});

describe('httpRetryStrategy', () => {
    const envVarName = 'NANGO_RETRYABLE_NETWORK_ERRORS';

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it('should retry for a network error provided by env var', async () => {
        vi.stubEnv(envVarName, 'E_CUSTOM_NETWORK');
        vi.resetModules();

        const [{ AxiosError }, { httpRetryStrategy }] = await Promise.all([import('axios'), import('./retry.js')]);
        const err = new AxiosError('boom', 'E_CUSTOM_NETWORK');

        expect(httpRetryStrategy(err, 1)).toBe(true);
    });

    it('should trim and match env-provided codes when list has spaces after commas', async () => {
        vi.stubEnv(envVarName, 'E_CUSTOM_NETWORK, UND_ERR_SOCKET');
        vi.resetModules();

        const [{ AxiosError }, { httpRetryStrategy }] = await Promise.all([import('axios'), import('./retry.js')]);

        expect(httpRetryStrategy(new AxiosError('boom', 'E_CUSTOM_NETWORK'), 1)).toBe(true);
        expect(httpRetryStrategy(new AxiosError('boom', 'UND_ERR_SOCKET'), 1)).toBe(true);
    });

    it('should ignore empty segments in env-provided comma list', async () => {
        vi.stubEnv(envVarName, 'E_ONE,, E_TWO ,');
        vi.resetModules();

        const [{ AxiosError }, { httpRetryStrategy }] = await Promise.all([import('axios'), import('./retry.js')]);

        expect(httpRetryStrategy(new AxiosError('boom', 'E_ONE'), 1)).toBe(true);
        expect(httpRetryStrategy(new AxiosError('boom', 'E_TWO'), 1)).toBe(true);
    });
});
