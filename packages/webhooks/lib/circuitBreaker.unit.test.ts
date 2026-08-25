import { describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { CircuitBreakerRedis } from './circuitBreaker.js';

describe('CircuitBreakerRedis', () => {
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
