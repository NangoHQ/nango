import { describe, expect, it, vi } from 'vitest';

import {
    clearPendingAccountDiscovery,
    getPendingAccountDiscovery,
    setDiscoveredAccountRecommendation,
    setPendingAccountDiscovery
} from './accountDiscoverySession.js';

import type { Request } from 'express';

const createRequest = (pendingAccountDiscovery?: {
    userId: number;
    expiresAt: number;
    recommendation?: { accountId: number; accountName: string };
}): Request => {
    const session = {
        pendingAccountDiscovery,
        save: vi.fn((callback: (error?: Error) => void) => callback())
    };

    return { session } as unknown as Request;
};

describe('account discovery onboarding session', () => {
    it('stores the user-bound onboarding marker in the server session', async () => {
        const req = createRequest();

        await setPendingAccountDiscovery(req, 42);

        expect(req.session.pendingAccountDiscovery).toMatchObject({ userId: 42 });
        expect(req.session.pendingAccountDiscovery?.expiresAt).toBeGreaterThan(Date.now());
        expect(req.session.save).toHaveBeenCalledOnce();
    });

    it('rejects a marker associated with another user', async () => {
        const req = createRequest({ userId: 42, expiresAt: Date.now() + 60_000 });

        await expect(getPendingAccountDiscovery(req, 7)).resolves.toBeNull();
        expect(req.session.save).not.toHaveBeenCalled();
    });

    it('removes and persists an expired marker', async () => {
        const req = createRequest({ userId: 42, expiresAt: Date.now() - 1 });

        await expect(getPendingAccountDiscovery(req, 42)).resolves.toBeNull();
        expect(req.session.pendingAccountDiscovery).toBeUndefined();
        expect(req.session.save).toHaveBeenCalledOnce();
    });

    it('persists the selected account recommendation for the pending discovery session', async () => {
        const req = createRequest({ userId: 42, expiresAt: Date.now() + 60_000 });

        await setDiscoveredAccountRecommendation(req, { accountId: 123, accountName: 'Example account' });

        expect(req.session.pendingAccountDiscovery?.recommendation).toStrictEqual({ accountId: 123, accountName: 'Example account' });
        expect(req.session.save).toHaveBeenCalledOnce();
    });

    it('clears the marker after a discovery without a recommendation', async () => {
        const req = createRequest({ userId: 42, expiresAt: Date.now() + 60_000 });

        await clearPendingAccountDiscovery(req);

        expect(req.session.pendingAccountDiscovery).toBeUndefined();
        expect(req.session.save).toHaveBeenCalledOnce();
    });
});
