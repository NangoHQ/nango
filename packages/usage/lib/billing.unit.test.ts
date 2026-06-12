import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok, metrics } from '@nangohq/utils';

import { UsageBillingClient } from './billing.js';

const { getUsageMock } = vi.hoisted(() => ({
    getUsageMock: vi.fn()
}));

vi.mock('@nangohq/billing', () => ({
    billing: {
        getUsage: getUsageMock
    }
}));

describe('UsageBillingClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns error when redis.get throws', async () => {
        getUsageMock.mockResolvedValue(Ok({ proxy: { total: 1 } } as any));
        const incrementSpy = vi.spyOn(metrics, 'increment').mockImplementation(() => {});

        const redis = {
            get: vi.fn().mockRejectedValue(new Error('redis down')),
            set: vi.fn()
        };
        const client = new UsageBillingClient(redis as any);

        const res = await client.getUsage('sub-1');
        expect(res.isErr()).toBe(true);
        if (res.isErr()) {
            expect(res.error.message).toBe('billing_usage_cache_error');
        }
        expect(getUsageMock).not.toHaveBeenCalled();
        expect(incrementSpy).toHaveBeenCalledWith(metrics.Types.BILLING_USAGE_CACHE, 1, { hit: 'error' });
        expect(incrementSpy).not.toHaveBeenCalledWith(metrics.Types.BILLING_USAGE_CACHE, 1, { hit: 'false' });

        incrementSpy.mockRestore();
    });

    it('throws when throttle fails on cache miss', async () => {
        getUsageMock.mockResolvedValue(Ok({ proxy: { total: 1 } } as any));

        const redis = {
            get: vi.fn().mockResolvedValue(null),
            set: vi.fn()
        };
        const client = new UsageBillingClient(redis as any);
        vi.spyOn((client as any).throttler, 'removeTokens').mockRejectedValue(new Error('redis down'));

        await expect(client.getUsage('sub-1')).rejects.toThrow('billing_usage_throttle_error');
        expect(getUsageMock).not.toHaveBeenCalled();
    });
});
