import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

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

    it('falls through to API when redis.get throws', async () => {
        const usageMetrics = { proxy: { total: 1 } };
        getUsageMock.mockResolvedValue(Ok(usageMetrics as any));

        const redis = {
            get: vi.fn().mockRejectedValue(new Error('redis down')),
            set: vi.fn()
        };
        const client = new UsageBillingClient(redis as any);
        (client as any).throttle = async (_key: string, fn: () => Promise<unknown>) => fn();

        const res = await client.getUsage('sub-1');
        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            expect(res.value.fromCache).toBe(false);
            expect(res.value.value).toEqual(usageMetrics);
        }
        expect(getUsageMock).toHaveBeenCalledWith('sub-1', undefined);
    });
});
