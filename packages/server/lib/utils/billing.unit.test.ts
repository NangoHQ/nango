import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { linkBillingFreeSubscription } from './billing.js';

import type * as NangoShared from '@nangohq/shared';
import type { DBPlan, DBTeam } from '@nangohq/types';

const mocks = vi.hoisted(() => ({
    createSubscription: vi.fn(),
    getPlan: vi.fn(),
    updatePlanByTeam: vi.fn()
}));

vi.mock('@nangohq/billing', () => ({ billing: { createSubscription: mocks.createSubscription } }));
vi.mock('@nangohq/shared', async (importOriginal) => {
    const actual = await importOriginal<typeof NangoShared>();
    return { ...actual, getPlan: mocks.getPlan, updatePlanByTeam: mocks.updatePlanByTeam };
});

const account = { id: 1, name: 'Acme' } as DBTeam;

describe('linkBillingFreeSubscription', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.createSubscription.mockResolvedValue(Ok({ id: 'sub_new' }));
        mocks.updatePlanByTeam.mockResolvedValue(Ok(true));
    });

    it('should create and link a free subscription when none is linked', async () => {
        mocks.getPlan.mockResolvedValue(Ok({ orb_subscription_id: null } as DBPlan));

        const res = await linkBillingFreeSubscription(account);

        expect(res.isOk()).toBe(true);
        expect(mocks.updatePlanByTeam).toHaveBeenCalledWith(expect.anything(), { account_id: 1, orb_subscription_id: 'sub_new' });
    });

    it('should not replace a linked subscription', async () => {
        mocks.getPlan.mockResolvedValue(Ok({ orb_subscription_id: 'sub_paid' } as DBPlan));

        const res = await linkBillingFreeSubscription(account);

        expect(res.isErr()).toBe(true);
        expect(mocks.createSubscription).not.toHaveBeenCalled();
        expect(mocks.updatePlanByTeam).not.toHaveBeenCalled();
    });
});
