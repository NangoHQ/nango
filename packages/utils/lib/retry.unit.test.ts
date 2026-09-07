import { afterEach, describe, expect, it, vi } from 'vitest';

import { retry, retryFlexible } from './retry.js';

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
                    delayMs: () => 0,
                    retryOnError: (error) => error.message === 'another error'
                }
            );
        } catch (err: any) {
            expect(err.message).toEqual('my error');
        }
        expect(count).toBe(1);
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

// Capture the delays retryFlexible passes to setTimeout, without actually sleeping. Recording is gated
// by `capturing` so ambient setTimeout calls (e.g. from setup) don't pollute the assertions.
let capturing = false;
const recordedDelays: number[] = [];
vi.mock('node:timers/promises', () => ({
    setTimeout: (delay?: number) => {
        if (capturing) {
            recordedDelays.push(delay ?? 0);
        }
        return Promise.resolve();
    }
}));

describe('retryFlexible', () => {
    const maxDelay = 60 * 10 * 1000; // 10 minutes, mirrors the cap inside retryFlexible

    afterEach(() => {
        capturing = false;
        recordedDelays.length = 0;
    });

    // Runs retryFlexible forcing exactly one retry whose onError returns `onErrorWait`, and returns the
    // delay retryFlexible actually handed to setTimeout for that retry.
    async function getRetryDelay(onErrorWait: number): Promise<number> {
        let call = 0;
        capturing = true;
        await retryFlexible(
            () => {
                call += 1;
                if (call <= 1) {
                    throw new Error('boom');
                }
                return 'ok';
            },
            {
                max: 1,
                onError: () => ({ retry: true, reason: 'test', wait: onErrorWait })
            }
        );
        capturing = false;
        // exactly one retry => exactly one sleep
        expect(recordedDelays).toHaveLength(1);
        return recordedDelays[0] ?? NaN;
    }

    it('caps a header-driven wait at the 10 minute maxDelay', async () => {
        // A misbehaving/hostile provider returns a huge Retry-After-derived wait (~31 years).
        expect(await getRetryDelay(1_000_000_000_000)).toBe(maxDelay);
    });

    it('does not sleep for a negative wait', async () => {
        expect(await getRetryDelay(-5000)).toBe(0);
    });

    it('passes through a wait that is within the cap', async () => {
        expect(await getRetryDelay(5000)).toBe(5000);
    });
});
