import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { accountService, userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { claimConsentDecision, completeConsentDecision, establishConsentInteraction } from './interaction-state.service.js';

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
});

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
