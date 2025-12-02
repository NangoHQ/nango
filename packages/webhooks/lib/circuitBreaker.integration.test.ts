import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getRedis } from '@nangohq/kvstore';
import { Err, Ok } from '@nangohq/utils';

import { CircuitBreakerRedis } from './circuitBreaker.js';

import type { CircuitBreaker } from './circuitBreaker.js';
import type { RedisClientType } from 'redis';

describe('Circuit breaker', () => {
    let redis: RedisClientType;
    let circuitBreaker: CircuitBreaker;

    const failureThreshold = 3;
    const cooldownDurationSecs = 2;
    const windowSecs = 1;

    const executeNFailures = async (key: string, n: number) => {
        for (let i = 0; i < n; i++) {
            await circuitBreaker.execute(key, () => Promise.resolve(Err('test-error')));
        }
    };
    const waitForCooldown = () => {
        return new Promise((resolve) => setTimeout(resolve, cooldownDurationSecs * 1001));
    };
    const waitForWindow = () => {
        return new Promise((resolve) => setTimeout(resolve, windowSecs * 1001));
    };

    beforeAll(async () => {
        const url = process.env['NANGO_REDIS_URL'];
        if (!url) {
            throw new Error('NANGO_REDIS_URL environment variable is not set.');
        }
        redis = await getRedis(url);
    });

    beforeEach(() => {
        circuitBreaker = new CircuitBreakerRedis({
            id: 'circuitC',
            redis,
            options: {
                failureThreshold,
                windowSecs,
                cooldownDurationSecs,
                autoResetSecs: 600
            }
        });
    });

    afterEach(async () => {
        await redis.flushAll();
    });

    afterAll(async () => {
        await redis.disconnect();
    });

    describe('when CLOSED', () => {
        it('should allow execution', async () => {
            const res = await circuitBreaker.execute('keyK', () => Promise.resolve(Ok('success')));
            expect(res.unwrap()).toBe('success');
        });

        it('should not count failures outside the time window', async () => {
            const key = 'keyK';

            // Record 2 failures within the window
            await executeNFailures(key, failureThreshold - 1);

            // Wait for window to expire
            await waitForWindow();

            // Record 2 more failures - should NOT open circuit since old failures expired
            await executeNFailures(key, 2);

            // Circuit should still be CLOSED (only 2 recent failures, threshold is 3)
            const res = await circuitBreaker.execute(key, () => Promise.resolve(Ok('success')));
            expect(res.unwrap()).toBe('success');
        });
        it('should isolate circuit state per key', async () => {
            const key1 = 'endpoint-1';
            const key2 = 'endpoint-2';

            // Open circuit for key1
            await executeNFailures(key1, failureThreshold + 1);

            // key2 should still work
            const res = await circuitBreaker.execute(key2, () => Promise.resolve(Ok('success')));
            expect(res.unwrap()).toBe('success');

            // key1 should be blocked
            const res2 = await circuitBreaker.execute(key1, () => Promise.resolve(Ok('success')));
            expect(res2.isErr()).toBe(true);
        });
    });

    describe('when OPEN', () => {
        it('should reject execution', async () => {
            const key = 'keyK';

            // Trigger failures to open the circuit
            await executeNFailures(key, failureThreshold + 1);

            // Circuit should now be OPEN and reject execution
            const res = await circuitBreaker.execute(key, () => Promise.resolve(Ok('success')));

            expect(res.isErr()).toBe(true);
            if (res.isErr()) {
                expect(res.error.message).toEqual('circuit_breaker_open_circuitC_keyK');
            }
        });

        it('should transition to HALF_OPEN after cooldown', async () => {
            const key = 'keyK';

            // Trigger failures to open the circuit
            await executeNFailures(key, failureThreshold + 1);

            // Wait for cooldown to expire
            await waitForCooldown();

            // Next execution should be a recovery attempt (HALF_OPEN)
            const res = await circuitBreaker.execute(key, async () => Promise.resolve(Ok('recovery-success')));
            expect(res.unwrap()).toBe('recovery-success');
        });

        it('should reopen circuit if recovery attempt fails in HALF_OPEN state', async () => {
            const key = 'keyK';

            // Trigger failures to open the circuit
            await executeNFailures(key, failureThreshold + 1);

            // Wait for cooldown to expire
            await waitForCooldown();

            // Recovery attempt fails (HALF_OPEN → OPEN)
            const recoveryRes = await circuitBreaker.execute(key, () => Promise.resolve(Err('recovery-failed')));
            expect(recoveryRes.isErr()).toBe(true);

            // Circuit should be OPEN again and reject subsequent executions
            const res = await circuitBreaker.execute(key, () => Promise.resolve(Ok('success')));
            expect(res.isErr()).toBe(true);
            if (res.isErr()) {
                expect(res.error.message).toEqual('circuit_breaker_open_circuitC_keyK');
            }
        });

        it('should close circuit if recovery attempt succeeds in HALF_OPEN state', async () => {
            const key = 'keyK';

            // Trigger failures to open the circuit
            await executeNFailures(key, failureThreshold + 1);

            // Wait for cooldown to expire
            await waitForCooldown();

            // Recovery attempt succeeds (HALF_OPEN → CLOSED)
            const recoveryRes = await circuitBreaker.execute(key, () => Promise.resolve(Ok('recovery-success')));
            expect(recoveryRes.unwrap()).toBe('recovery-success');

            // Circuit should be CLOSED and allow normal execution
            const res = await circuitBreaker.execute(key, () => Promise.resolve(Ok('normal-success')));
            expect(res.unwrap()).toBe('normal-success');
        });
    });

    describe('when HALF_OPEN', () => {
        it('should allow some executions', async () => {
            const key = 'keyK';
            // Trigger failures to open the circuit
            await executeNFailures(key, failureThreshold + 1);
            // Wait for cooldown to expire
            await waitForCooldown();

            // First recovery attempt to transition to HALF_OPEN
            const exec1 = circuitBreaker.execute(key, async () => {
                await new Promise((resolve) => setTimeout(resolve, 100)); // slight delay
                return Ok('recovery-success');
            });
            // try another execution before the first one completes
            await new Promise((resolve) => setTimeout(resolve, 20)); // ensure overlap
            const exec2 = circuitBreaker.execute(key, () => Promise.resolve(Ok('should-fail')));

            // wait for both executions
            await exec1;
            const res = await exec2;
            expect(res.isErr()).toBe(true);
            if (res.isErr()) {
                expect(res.error.message).toEqual('circuit_breaker_halfopen_circuitC_keyK');
            }
        });

        it('should reopen circuit if execution fails', async () => {
            const key = 'keyK';

            // Trigger failures to open the circuit
            await executeNFailures(key, failureThreshold + 1);

            // Wait for cooldown to expire
            await waitForCooldown();

            // In HALF_OPEN, execution fails → re-open circuit
            const res = await circuitBreaker.execute(key, () => Promise.resolve(Err('half-open-failed')));
            expect(res.isErr()).toBe(true);

            // Circuit should be OPEN again and reject subsequent executions
            const res2 = await circuitBreaker.execute(key, () => Promise.resolve(Ok('success')));
            expect(res2.isErr()).toBe(true);
            if (res2.isErr()) {
                expect(res2.error.message).toEqual('circuit_breaker_open_circuitC_keyK');
            }
        });

        it('should close circuit if execution succeeds', async () => {
            const key = 'keyK';

            // Trigger failures to open the circuit
            await executeNFailures(key, failureThreshold + 1);

            // Wait for cooldown to expire
            await waitForCooldown();

            // In HALF_OPEN, execution succeeds → close circuit
            const res = await circuitBreaker.execute(key, async () => Promise.resolve(Ok('half-open-success')));
            expect(res.unwrap()).toBe('half-open-success');

            // Circuit should be CLOSED and allow normal execution
            const res2 = await circuitBreaker.execute(key, () => Promise.resolve(Ok('normal-success')));
            expect(res2.unwrap()).toBe('normal-success');
        });
        it('can allow multiple attempts recovery', async () => {
            const key = 'keyK';

            // Trigger failures to open the circuit
            await executeNFailures(key, failureThreshold + 1);

            // Wait for cooldown to expire
            await waitForCooldown();

            // Start multiple recovery attempts simultaneously
            const results = await Promise.all([
                circuitBreaker.execute(key, () => Promise.resolve(Ok(`recovery-success-1`))),
                circuitBreaker.execute(key, () => Promise.resolve(Ok(`recovery-success-2`))),
                circuitBreaker.execute(key, () => Promise.resolve(Ok(`recovery-success-3`)))
            ]);

            // All attempts should succeed
            expect(results.filter((res) => res.isOk()).length).toBe(3);
        });
    });
    describe('auto reset', () => {
        it('should reset circuit after auto reset duration', async () => {
            const circuitBreaker = new CircuitBreakerRedis({
                id: 'circuitC',
                redis,
                options: {
                    failureThreshold: 2,
                    windowSecs: 1,
                    cooldownDurationSecs: 1,
                    autoResetSecs: 2
                }
            });

            const key = 'KeyK';
            // Trigger failures to open the circuit
            for (let i = 0; i < 3; i++) {
                await circuitBreaker.execute(key, () => Promise.resolve(Err('test-error')));
            }

            // Circuit should now be OPEN and reject execution
            const resOpen = await circuitBreaker.execute(key, () => Promise.resolve(Ok('success')));
            expect(resOpen.isErr()).toBe(true);
            if (resOpen.isErr()) {
                expect(resOpen.error.message).toEqual('circuit_breaker_open_circuitC_KeyK');
            }

            // Wait for auto reset duration to expired
            await new Promise((resolve) => setTimeout(resolve, 2500));

            // Circuit should be reset to CLOSED and allow execution
            const resClosed = await circuitBreaker.execute(key, () => Promise.resolve(Ok('success')));
            expect(resClosed.unwrap()).toBe('success');
        });
    });
});
