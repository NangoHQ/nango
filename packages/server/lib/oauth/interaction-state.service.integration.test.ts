import { createHash } from 'node:crypto';

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { accountService, userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { claimConsentDecision, completeConsentDecision, deleteExpiredOAuthInteractionState, establishConsentInteraction } from './interaction-state.service.js';

describe('OAuth interaction state', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    beforeEach(async () => {
        await db.knex('oauth_consent_interactions').delete();
    });

    it('claims an interaction once with user-specific CSRF', async () => {
        const { user, account } = await createUser();
        const uid = `interaction-${nanoid()}`;
        const csrfToken = await establishConsentInteraction({ uid, userId: user.id, accountId: account.id, expiresAt: new Date(Date.now() + 600_000) });
        if (!csrfToken) throw new Error('Failed to establish consent interaction');

        await expect(claimConsentDecision({ uid, csrfToken: 'x'.repeat(32), userId: user.id, accountId: account.id })).resolves.toBe('invalid_csrf');
        await expect(claimConsentDecision({ uid, csrfToken, userId: user.id, accountId: account.id + 1 })).resolves.toBe('invalid_csrf');
        await expect(claimConsentDecision({ uid, csrfToken, userId: user.id, accountId: account.id })).resolves.toBe('claimed');
        await expect(claimConsentDecision({ uid, csrfToken, userId: user.id, accountId: account.id })).resolves.toBe('completed');
        await completeConsentDecision(uid, 'approved');
        await expect(
            establishConsentInteraction({ uid, userId: user.id, accountId: account.id, expiresAt: new Date(Date.now() + 600_000) })
        ).resolves.toBeNull();
    });

    it('keeps recently claimed expired interactions until the processing grace elapses', async () => {
        const { user, account } = await createUser();
        const recentUid = `recent-processing-${nanoid()}`;
        const staleUid = `stale-processing-${nanoid()}`;
        const pendingUid = `pending-${nanoid()}`;
        const expiredAt = new Date(Date.now() - 60_000);
        for (const uid of [recentUid, staleUid, pendingUid]) {
            await establishConsentInteraction({ uid, userId: user.id, accountId: account.id, expiresAt: expiredAt });
        }

        await db
            .knex('oauth_consent_interactions')
            .where({ interaction_uid_hash: hash(recentUid) })
            .update({ status: 'processing', updated_at: new Date() });
        await db
            .knex('oauth_consent_interactions')
            .where({ interaction_uid_hash: hash(staleUid) })
            .update({ status: 'processing', updated_at: new Date(Date.now() - 6 * 60_000) });

        await expect(deleteExpiredOAuthInteractionState(10)).resolves.toBe(2);
        const remaining = await db.knex('oauth_consent_interactions').select<{ interaction_uid_hash: Buffer }[]>('interaction_uid_hash');
        expect(remaining.map((row) => row.interaction_uid_hash)).toEqual([hash(recentUid)]);
    });
});

function hash(value: string): Buffer {
    return createHash('sha256').update(value).digest();
}

async function createUser() {
    const value = nanoid();
    const account = await accountService.createAccount({ name: `OAuth account ${value}`, email: `owner-${value}@example.com` });
    if (!account) throw new Error('Failed to create OAuth test account');
    const user = await userService.createUser({
        name: 'OAuth user',
        email: `user-${value}@example.com`,
        account_id: account.id,
        email_verified: true,
        role: 'administrator'
    });
    if (!user) throw new Error('Failed to create OAuth test user');
    return { user, account };
}
