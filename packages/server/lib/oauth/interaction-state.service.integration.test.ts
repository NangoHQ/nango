import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { accountService, userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import {
    claimConsentDecision,
    completeConsentDecision,
    consumeLoginHandoff,
    createLoginHandoff,
    establishConsentInteraction,
    issueLoginHandoff
} from './interaction-state.service.js';

const issuer = 'http://localhost:3003';

describe('OAuth interaction state', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    beforeEach(async () => {
        await db.knex('oauth_consent_interactions').delete();
        await db.knex('oauth_login_handoffs').delete();
    });

    it('binds a handoff to the interaction and consumes it exactly once', async () => {
        const { user, account } = await createUser();
        const uid = `interaction-${nanoid()}`;
        const returnDestination = `${issuer}/oauth/consent/${uid}/handoff`;
        const state = await createLoginHandoff({ uid, issuer, returnDestination, interactionExpiresAt: new Date(Date.now() + 600_000) });

        const issued = await issueLoginHandoff({ state, userId: user.id, accountId: account.id, issuer });
        expect(issued).toMatchObject({ consumeUrl: returnDestination });
        if ('error' in issued) throw new Error(`Handoff issuance failed: ${issued.error}`);

        await expect(
            consumeLoginHandoff({ code: issued.code, uid: `${uid}-tampered`, issuer, returnDestination: `${issuer}/oauth/consent/${uid}-tampered/handoff` })
        ).resolves.toEqual({ error: 'invalid' });
        await expect(consumeLoginHandoff({ code: issued.code, uid, issuer, returnDestination })).resolves.toEqual({ userId: user.id, accountId: account.id });
        await expect(consumeLoginHandoff({ code: issued.code, uid, issuer, returnDestination })).resolves.toEqual({ error: 'replayed' });
        await expect(issueLoginHandoff({ state, userId: user.id, accountId: account.id, issuer })).resolves.toEqual({ error: 'replayed' });
    });

    it('rejects expired, cross-issuer, and unsafe handoffs', async () => {
        const { user, account } = await createUser();
        const uid = `interaction-${nanoid()}`;
        const returnDestination = `${issuer}/oauth/consent/${uid}/handoff`;
        const state = await createLoginHandoff({ uid, issuer, returnDestination, interactionExpiresAt: new Date(Date.now() + 600_000) });
        await db.knex('oauth_login_handoffs').update({ expires_at: new Date(Date.now() - 1) });

        await expect(issueLoginHandoff({ state, userId: user.id, accountId: account.id, issuer })).resolves.toEqual({ error: 'expired' });
        await expect(issueLoginHandoff({ state, userId: user.id, accountId: account.id, issuer: 'http://other.example.com' })).resolves.toEqual({
            error: 'invalid'
        });
        await expect(
            createLoginHandoff({
                uid,
                issuer,
                returnDestination: 'https://attacker.example.com/collect',
                interactionExpiresAt: new Date(Date.now() + 600_000)
            })
        ).rejects.toThrow('Unsafe OAuth login handoff return destination');
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
