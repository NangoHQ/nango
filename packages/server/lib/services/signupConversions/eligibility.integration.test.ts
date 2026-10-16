import { randomUUID } from 'node:crypto';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import {
    bindSignupAdvertisingConsent,
    completeSignupAdvertisingConsent,
    consentOwnerHash,
    readAdvertisingConsent,
    recordAdvertisingConsent,
    seeders
} from '@nangohq/shared';
import { envs } from '@nangohq/shared/dist/env.js';

import { getConversionEligibility } from './eligibility.js';

const originalEnabled = envs.ADVERTISING_CONSENT_ENABLED;
const accounts: number[] = [];
const owners: string[] = [];
const grant = {
    preferences: false,
    statistics: true,
    marketing: true,
    method: 'explicit' as const,
    globalPrivacyControl: false,
    regulations: { gdprApplies: true, lgpdApplies: false, ccpaApplies: false }
};
beforeAll(async () => {
    await multipleMigrations();
});
afterEach(async () => {
    envs.ADVERTISING_CONSENT_ENABLED = originalEnabled;
    await db.knex('signup_advertising_consents').whereIn('account_id', accounts).delete();
    await db.knex('advertising_consents').whereIn('owner_hash', owners).delete();
    accounts.length = 0;
    owners.length = 0;
});

async function fixture() {
    envs.ADVERTISING_CONSENT_ENABLED = true;
    const ownerHash = consentOwnerHash(randomUUID());
    owners.push(ownerHash);
    await recordAdvertisingConsent({
        ownerHash,
        choice: grant,
        expectedRevision: null,
        clickIds: { fbclid: 'local-meta', oppref: 'local-chatgpt' },
        lifetimeMs: 60_000
    });
    const consent = await readAdvertisingConsent(ownerHash);
    if (!consent) throw new Error('Missing consent');
    const { account, user } = await seeders.seedAccountEnvAndUser();
    accounts.push(account.id);
    await db
        .knex('_nango_users')
        .where({ id: user.id })
        .update({ email: `${randomUUID()}@example.com`, email_verified: true, suspended: false });
    const reference = {
        id: consent.id,
        revision: consent.revision,
        signupId: randomUUID(),
        browser: { sourceUrl: 'https://app.nango.dev/signup', userAgent: 'Test browser' }
    };
    await db.knex.transaction(async (trx) => bindSignupAdvertisingConsent(trx, account.id, reference));
    await completeSignupAdvertisingConsent(account.id, user.id, reference);
    const input = { accountId: account.id, creatorId: user.id, platform: 'meta' as const };
    const startAt = new Date(Date.now() - 60_000);
    return { input, startAt, ownerHash, consent, reference };
}

describe('database-backed destination eligibility', () => {
    it('returns stable account identity and original time, with only the requested platform context', async () => {
        const f = await fixture();
        const first = await getConversionEligibility(f.input, f.startAt);
        expect(first).toMatchObject({ eligible: true, eventId: `nango:account_create:${f.input.accountId}`, touch: { fbclid: 'local-meta' } });
        expect(JSON.stringify(first)).not.toContain('local-chatgpt');
        expect(await getConversionEligibility(f.input, f.startAt)).toEqual(first);
        const chatgpt = await getConversionEligibility({ ...f.input, platform: 'chatgpt' }, f.startAt);
        expect(chatgpt).toMatchObject({ eligible: true, touch: { oppref: 'local-chatgpt' } });
        expect(JSON.stringify(chatgpt)).not.toContain('local-meta');
    });

    it('rejects a new lookup after withdrawal and after regrant', async () => {
        const f = await fixture();
        expect((await getConversionEligibility(f.input, f.startAt)).eligible).toBe(true);
        const withdrawn = await recordAdvertisingConsent({
            ownerHash: f.ownerHash,
            choice: { ...grant, marketing: false },
            expectedRevision: f.consent.revision,
            clickIds: {},
            lifetimeMs: 60_000
        });
        expect(await getConversionEligibility(f.input, f.startAt)).toEqual({ eligible: false });
        if (!withdrawn) throw new Error('Missing withdrawal');
        await recordAdvertisingConsent({
            ownerHash: f.ownerHash,
            choice: grant,
            expectedRevision: withdrawn.revision,
            clickIds: { fbclid: 'new-click' },
            lifetimeMs: 60_000
        });
        expect(await getConversionEligibility(f.input, f.startAt)).toEqual({ eligible: false });
    });

    it('does not authorize nonexistent accounts or a teammate in place of the account creator', async () => {
        const f = await fixture();
        const other = await fixture();
        await db.knex('_nango_users').where({ id: other.input.creatorId }).update({ account_id: f.input.accountId });
        expect(await getConversionEligibility({ ...f.input, creatorId: other.input.creatorId }, f.startAt)).toEqual({ eligible: false });
        expect(await getConversionEligibility({ ...f.input, accountId: 2147483647 }, f.startAt)).toEqual({ eligible: false });
    });

    it.each([{ email_verified: false }, { suspended: true }, { email: 'internal@nango.dev' }])('rejects an ineligible creator: %j', async (change) => {
        const f = await fixture();
        await db.knex('_nango_users').where({ id: f.input.creatorId }).update(change);
        expect(await getConversionEligibility(f.input, f.startAt)).toEqual({ eligible: false });
    });

    it('blocks expired consent, a missing platform touch and disabled consent reads', async () => {
        const f = await fixture();
        envs.ADVERTISING_CONSENT_ENABLED = false;
        expect(await getConversionEligibility(f.input, f.startAt)).toEqual({ eligible: false });
        envs.ADVERTISING_CONSENT_ENABLED = true;
        await db
            .knex('signup_advertising_consents')
            .where({ account_id: f.input.accountId })
            .update({ click_context: { browser: f.reference.browser } });
        expect(await getConversionEligibility(f.input, f.startAt)).toEqual({ eligible: false });
        const fresh = await fixture();
        await db
            .knex('advertising_consents')
            .where({ id: fresh.consent.id })
            .update({ expires_at: new Date(0) });
        expect(await getConversionEligibility(fresh.input, fresh.startAt)).toEqual({ eligible: false });
    });

    it('blocks pre-rollout signups, future signups, invalid cutoff and signups older than 24 hours', async () => {
        const f = await fixture();
        expect(await getConversionEligibility(f.input, new Date(Date.now() + 1000))).toEqual({ eligible: false });
        expect(await getConversionEligibility(f.input, new Date('invalid'))).toEqual({ eligible: false });
        for (const created_at of [new Date(Date.now() + 60_000), new Date(Date.now() - 86_400_001)]) {
            await db.knex('_nango_accounts').where({ id: f.input.accountId }).update({ created_at });
            expect(await getConversionEligibility(f.input, new Date(0))).toEqual({ eligible: false });
        }
    });
});
