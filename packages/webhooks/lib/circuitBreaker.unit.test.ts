import { describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { CircuitBreakerRedis } from './circuitBreaker.js';

describe('CircuitBreakerRedis', () => {
    it('leaves expired HALF_OPEN when failure counter delete fails after recovery success', async () => {
        const stateKey = 'circuitbreaker:test:endpoint';
        let storedState: string | null = JSON.stringify({ state: 'OPEN', untilMs: Date.now() - 1000 });

        const redis = {
            get: vi.fn((key: string) => Promise.resolve(key === stateKey ? storedState : null)),
            set: vi.fn((key: string, value: string) => {
                if (key === stateKey) {
                    storedState = value;
                }
                return Promise.resolve('OK');
            }),
            del: vi.fn((key: string) => {
                if (key === stateKey) {
                    storedState = null;
                }
                return Promise.resolve(1);
            })
        };

        const circuitBreaker = new CircuitBreakerRedis({
            id: 'test',
            redis: redis as any,
            options: {
                failureThreshold: 3,
                windowSecs: 60,
                cooldownDurationSecs: 60,
                autoResetSecs: 600
            }
        });
        vi.spyOn((circuitBreaker as any).failureLimiter, 'delete').mockRejectedValue(new Error('redis down'));

        const res = await circuitBreaker.execute('endpoint', () => Promise.resolve(Ok('recovery-success')));
        expect(res.isOk()).toBe(true);

        expect(storedState).not.toBeNull();
        if (storedState === null) {
            throw new Error('expected state to be set');
        }
        expect(JSON.parse(storedState)).toEqual({ state: 'HALF_OPEN', untilMs: expect.any(Number) });
        expect(redis.del).not.toHaveBeenCalledWith(stateKey);
    });

    it('execute runs fn when getState redis fails', async () => {
        const redis = {
            get: vi.fn().mockRejectedValue(new Error('redis down'))
        };
        const circuitBreaker = new CircuitBreakerRedis({
            id: 'test',
            redis: redis as any,
            options: {
                failureThreshold: 3,
                windowSecs: 60,
                cooldownDurationSecs: 60,
                autoResetSecs: 600
            }
        });

        const res = await circuitBreaker.execute('key', () => Promise.resolve(Ok('success')));
        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            expect(res.value).toBe('success');
        }
    });
});
