import { randomUUID } from 'node:crypto';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { createAccount } from '../seeders/account.seeder.js';
import {
    bindSignupAdvertisingConsent,
    completeSignupAdvertisingConsent,
    consentOwnerHash,
    deleteExpiredAdvertisingConsents,
    getSignupAdvertisingPermission,
    invalidateAdvertisingPermissions,
    readAdvertisingConsent,
    recordAdvertisingConsent
} from './advertisingConsent.js';
import userService from './user.service.js';

import type { AdvertisingConsentChoice } from '@nangohq/types';

const grant = {
    preferences: false,
    statistics: true,
    marketing: true,
    method: 'explicit' as const,
    globalPrivacyControl: false,
    regulations: { gdprApplies: true, lgpdApplies: false, ccpaApplies: false }
};
const lifetimeMs = 60000;

beforeAll(async () => {
    await multipleMigrations();
});
afterEach(() => {
    vi.unstubAllEnvs();
});

describe('stored advertising consent', () => {
    async function signup(internal = false, complete = true, choice: AdvertisingConsentChoice = grant) {
        vi.stubEnv('ADVERTISING_CONSENT_ENABLED', 'true');
        const ownerHash = consentOwnerHash(randomUUID());
        await recordAdvertisingConsent({ ownerHash, choice, expectedRevision: null, clickIds: { gclid: 'test-click' }, lifetimeMs });
        const consent = await readAdvertisingConsent(ownerHash);
        if (!consent) throw new Error('Missing consent');
        const account = await createAccount();
        const reference = { id: consent.id, revision: consent.revision, signupId: randomUUID() };
        await db.knex.transaction(async (trx) => {
            await bindSignupAdvertisingConsent(trx, account.id, reference);
        });
        const user = await userService.createUser({
            email: `${randomUUID()}@${internal ? 'nango.dev' : 'example.com'}`,
            name: 'Consent test',
            account_id: account.id,
            email_verified: true,
            role: 'administrator'
        });
        if (!user) throw new Error('Missing creator');
        if (complete) await completeSignupAdvertisingConsent(account.id, user.id, reference);
        return { ownerHash, account, reference, user };
    }

    it('invalidates a queued signup after withdrawal and does not restore it on regrant', async () => {
        const { ownerHash, account, reference } = await signup();
        expect((await getSignupAdvertisingPermission(account.id))?.context.google?.ids).toEqual({ gclid: 'test-click' });
        const withdrawn = await recordAdvertisingConsent({
            ownerHash,
            choice: { ...grant, marketing: false },
            expectedRevision: reference.revision,
            clickIds: {},
            lifetimeMs
        });
        expect(await getSignupAdvertisingPermission(account.id)).toBeNull();
        expect(
            (
                await db
                    .knex<{ account_id: number; click_context: Record<string, string> }>('signup_advertising_consents')
                    .where({ account_id: account.id })
                    .first()
            )?.click_context
        ).toEqual({});
        await recordAdvertisingConsent({ ownerHash, choice: grant, expectedRevision: withdrawn?.revision ?? null, clickIds: {}, lifetimeMs });
        expect(await getSignupAdvertisingPermission(account.id)).toBeNull();
    });

    it('does not let an external teammate authorize an internal creator signup', async () => {
        const { account, user } = await signup(true);
        await userService.createUser({
            email: `${randomUUID()}@example.com`,
            name: 'Teammate',
            account_id: account.id,
            email_verified: true,
            role: 'administrator'
        });
        expect(await getSignupAdvertisingPermission(account.id)).toBeNull();
        await db
            .knex('_nango_users')
            .where({ id: user.id })
            .update({ email: `${randomUUID()}@example.com` });
        expect(await getSignupAdvertisingPermission(account.id)).toBeNull();
    });

    it('requires the exact creator request and retains signup time through verification', async () => {
        const { account, reference, user } = await signup(false, false);
        expect(await getSignupAdvertisingPermission(account.id)).toBeNull();
        await completeSignupAdvertisingConsent(account.id, user.id, { ...reference, signupId: randomUUID() });
        expect(await getSignupAdvertisingPermission(account.id)).toBeNull();
        await db.knex('_nango_users').where({ id: user.id }).update({ email_verified: false });
        await completeSignupAdvertisingConsent(account.id, user.id, reference);
        expect(await getSignupAdvertisingPermission(account.id)).toBeNull();
        const binding = await db.knex<{ account_id: number; created_at: Date }>('signup_advertising_consents').where({ account_id: account.id }).first();
        if (!binding) throw new Error('Missing signup binding');
        await db.knex('_nango_users').where({ id: user.id }).update({ email_verified: true });
        const permission = await getSignupAdvertisingPermission(account.id);
        expect(permission?.signupAt).toEqual(binding.created_at);
        expect(permission?.consent).toMatchObject({
            choice: grant,
            revision: reference.revision,
            source: 'cookiebot',
            mappingVersion: 'cookiebot-regional-marketing-v2',
            adStorage: 'granted',
            adUserData: 'granted',
            adPersonalization: 'granted'
        });
    });

    it('reports regional-default eligibility and invalidates that signup on GPC', async () => {
        const choice = { ...grant, method: 'implied' as const, regulations: { gdprApplies: false, lgpdApplies: false, ccpaApplies: true } };
        const { ownerHash, account, reference } = await signup(false, true, choice);
        expect((await getSignupAdvertisingPermission(account.id))?.consent).toMatchObject({
            basis: 'regional_default',
            choice: { method: 'implied' },
            mappingVersion: 'cookiebot-regional-marketing-v2'
        });
        const withdrawn = await recordAdvertisingConsent({
            ownerHash,
            choice: { ...choice, globalPrivacyControl: true },
            expectedRevision: reference.revision,
            clickIds: {},
            lifetimeMs
        });
        expect(await getSignupAdvertisingPermission(account.id)).toBeNull();
        expect((await readAdvertisingConsent(ownerHash))?.click_context).toEqual({});
        await recordAdvertisingConsent({ ownerHash, choice, expectedRevision: withdrawn?.revision ?? null, clickIds: {}, lifetimeMs });
        expect(await getSignupAdvertisingPermission(account.id)).toBeNull();
    });

    it('rejects stale grants and keeps the latest withdrawal', async () => {
        const { ownerHash, reference } = await signup();
        await recordAdvertisingConsent({ ownerHash, choice: { ...grant, marketing: false }, expectedRevision: reference.revision, clickIds: {}, lifetimeMs });
        expect(
            await recordAdvertisingConsent({ ownerHash, choice: grant, expectedRevision: reference.revision, clickIds: { gclid: 'stale' }, lifetimeMs })
        ).toBeNull();
        expect((await readAdvertisingConsent(ownerHash))?.choice.marketing).toBe(false);
    });

    it('does not retain a binding when the enclosing account operation rolls back', async () => {
        const { account, reference } = await signup();
        await db.knex('signup_advertising_consents').where({ account_id: account.id }).delete();
        await expect(
            db.knex.transaction(async (trx) => {
                await bindSignupAdvertisingConsent(trx, account.id, reference);
                throw new Error('rollback');
            })
        ).rejects.toThrow('rollback');
        expect(await db.knex('signup_advertising_consents').where({ account_id: account.id }).first()).toBeUndefined();
    });

    it('contains an optional constraint failure in a savepoint', async () => {
        const { account, reference } = await signup();
        await db.knex.transaction(async (trx) => {
            await expect(bindSignupAdvertisingConsent(trx, account.id, reference)).rejects.toThrow();
            expect(await trx('_nango_accounts').where({ id: account.id }).first()).toBeDefined();
        });
    });

    it('disallows internal, unverified, expired and disabled reporting', async () => {
        const { account, reference } = await signup();
        await db.knex('_nango_users').where({ account_id: account.id }).update({ email_verified: false });
        expect(await getSignupAdvertisingPermission(account.id)).toBeNull();
        await db
            .knex('_nango_users')
            .where({ account_id: account.id })
            .update({ email_verified: true, email: `${randomUUID()}@nango.dev` });
        expect(await getSignupAdvertisingPermission(account.id)).toBeNull();
        await db
            .knex('advertising_consents')
            .where({ id: reference.id })
            .update({ expires_at: new Date(0) });
        expect(await getSignupAdvertisingPermission(account.id)).toBeNull();
        vi.stubEnv('ADVERTISING_CONSENT_ENABLED', 'false');
        expect(await getSignupAdvertisingPermission(account.id)).toBeNull();
    });

    it('does not extend the ad context lifetime on ordinary returning visits', async () => {
        const { ownerHash, reference } = await signup();
        const before = (await readAdvertisingConsent(ownerHash))?.expires_at;
        await recordAdvertisingConsent({ ownerHash, choice: grant, expectedRevision: reference.revision, clickIds: {}, lifetimeMs });
        expect((await readAdvertisingConsent(ownerHash))?.expires_at).toEqual(before);
    });

    it('retains choices on rollback while preventing replay after re-enablement', async () => {
        const { ownerHash, account, reference } = await signup();
        const before = await readAdvertisingConsent(ownerHash);
        await invalidateAdvertisingPermissions();
        await deleteExpiredAdvertisingConsents(new Date());
        const after = await readAdvertisingConsent(ownerHash);
        expect(after?.choice).toEqual(grant);
        expect(after?.expires_at).toEqual(before?.expires_at);
        expect(after?.click_context).toEqual({});
        expect(await getSignupAdvertisingPermission(account.id)).toBeNull();
        await recordAdvertisingConsent({ ownerHash, choice: grant, expectedRevision: reference.revision, clickIds: {}, lifetimeMs });
        expect(await getSignupAdvertisingPermission(account.id)).toBeNull();
    });

    it('cleans expired context and its binding without deleting the account', async () => {
        const { account, reference } = await signup();
        await db
            .knex('advertising_consents')
            .where({ id: reference.id })
            .update({ expires_at: new Date(0) });
        await deleteExpiredAdvertisingConsents(new Date(1));
        expect(await db.knex('signup_advertising_consents').where({ account_id: account.id }).first()).toBeUndefined();
        expect(await db.knex('_nango_accounts').where({ id: account.id }).first()).toBeDefined();
    });
});
