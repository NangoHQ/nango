import { randomUUID } from 'node:crypto';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { conversionEventId, deliverNextConversion, enqueueConversions } from './worker.js';

import type { ConversionAdapter, Platform } from './worker.js';
import type { SignupAdvertisingPermission } from '@nangohq/types';

const testAccounts: number[] = [];
const testConsents: string[] = [];

beforeAll(async () => {
    await multipleMigrations();
});
afterEach(async () => {
    vi.restoreAllMocks();
    await db.knex('signup_ad_conversions').whereIn('account_id', testAccounts).delete();
    await db.knex('signup_advertising_consents').whereIn('account_id', testAccounts).delete();
    await db.knex('advertising_consents').whereIn('id', testConsents).delete();
    testAccounts.length = 0;
    testConsents.length = 0;
});

async function fixture(destination: string = randomUUID(), platform: Platform = 'meta') {
    const { account } = await seeders.seedAccountEnvAndUser();
    testAccounts.push(account.id);
    const now = new Date();
    await db.knex('_nango_accounts').where({ id: account.id }).update({ created_at: now });
    const consentId = randomUUID();
    testConsents.push(consentId);
    const choice = {
        preferences: false,
        statistics: true,
        marketing: true,
        method: 'explicit' as const,
        globalPrivacyControl: false,
        regulations: { gdprApplies: true, lgpdApplies: false, ccpaApplies: false }
    };
    const context = {
        meta: { fbclid: 'local-test-id', observedAt: now.toISOString(), source: 'landing_query' as const },
        x: { twclid: 'local-x-id', observedAt: now.toISOString(), source: 'landing_query' as const },
        browser: { sourceUrl: 'https://app.nango.dev/signup', userAgent: 'Test browser' }
    };
    await db.knex('advertising_consents').insert({
        id: consentId,
        owner_hash: randomUUID(),
        choice,
        revision: 1,
        click_context: context,
        observed_at: now,
        expires_at: new Date(now.getTime() + 86_400_000)
    });
    await db.knex('signup_advertising_consents').insert({
        account_id: account.id,
        consent_id: consentId,
        consent_revision: 1,
        signup_id: randomUUID(),
        click_context: context,
        created_at: now,
        expires_at: new Date(now.getTime() + 86_400_000)
    });
    const permission: SignupAdvertisingPermission = {
        context,
        signupAt: now,
        consent: {
            choice,
            revision: 1,
            observedAt: now,
            source: 'cookiebot',
            mappingVersion: 'cookiebot-regional-marketing-v2',
            basis: 'explicit',
            adStorage: 'granted',
            adUserData: 'granted',
            adPersonalization: 'granted'
        }
    };
    const send = vi.fn<ConversionAdapter['send']>().mockResolvedValue({ status: 'accepted', receiptId: 'local-receipt' });
    const adapter: ConversionAdapter = {
        platform,
        destination,
        startAt: now,
        prepare: (id, p) => ({ id: conversionEventId(id), time: p.signupAt.toISOString() }),
        send
    };
    // Only retire this test's earlier fixtures. The suite uses disposable local services.
    await db.knex('signup_ad_conversions').whereIn('account_id', testAccounts).where('status', 'pending').update({ status: 'skipped' });
    await enqueueConversions(adapter);
    const row = () => db.knex('signup_ad_conversions').where({ account_id: account.id, platform }).first();
    const due = () =>
        db
            .knex('signup_ad_conversions')
            .where({ account_id: account.id, platform })
            .update({ next_attempt_at: new Date(0) });
    return { account, permission, adapter, send, row, due };
}

describe('signup conversion delivery', () => {
    it('queues X click context and waits for permission before sending', async () => {
        const f = await fixture('pixel/signup-event', 'x');
        const lookup = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(f.permission);
        await deliverNextConversion(f.adapter, () => true, lookup);
        expect(f.send).not.toHaveBeenCalled();
        expect(await f.row()).toMatchObject({ platform: 'x', attempts: 0, reason: 'permission_unavailable' });
        await f.due();
        await deliverNextConversion(f.adapter, () => true, lookup);
        expect(f.send).toHaveBeenCalledOnce();
        expect(await f.row()).toMatchObject({ platform: 'x', status: 'accepted', attempts: 1 });
    });

    it('stores the maximum Google destination length', async () => {
        const destination = `${'1'.repeat(100)}/${'2'.repeat(100)}`;
        const f = await fixture(destination);
        expect(await f.row()).toMatchObject({ destination, status: 'pending' });
    });

    it('deduplicates enqueue and concurrent workers, and records acceptance only once', async () => {
        const f = await fixture();
        await Promise.all([enqueueConversions(f.adapter), enqueueConversions(f.adapter)]);
        const lookup = vi.fn().mockResolvedValue(f.permission);
        await Promise.all([deliverNextConversion(f.adapter, () => true, lookup), deliverNextConversion(f.adapter, () => true, lookup)]);
        expect(f.send).toHaveBeenCalledTimes(1);
        expect(await f.row()).toMatchObject({ status: 'accepted', attempts: 1, receipt_id: 'local-receipt', lease_id: null });
        await f.due();
        await deliverNextConversion(f.adapter, () => true, lookup);
        expect(f.send).toHaveBeenCalledTimes(1);
    });

    it('defers verification and rechecks permission without changing the original ID or timestamp', async () => {
        const f = await fixture();
        const lookup = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(f.permission);
        await deliverNextConversion(f.adapter, () => true, lookup);
        expect(f.send).not.toHaveBeenCalled();
        expect(await f.row()).toMatchObject({ attempts: 0, reason: 'permission_unavailable' });
        await f.due();
        await deliverNextConversion(f.adapter, () => true, lookup);
        expect(f.send).toHaveBeenCalledWith({ id: conversionEventId(f.account.id), time: f.permission.signupAt.toISOString() });
    });

    it('retries uncertain sends with the same identity, and blocks retries after withdrawal', async () => {
        const f = await fixture();
        f.send.mockRejectedValueOnce(new Error('secret response must not be retained'));
        await deliverNextConversion(
            f.adapter,
            () => true,
            () => Promise.resolve(f.permission)
        );
        expect(await f.row()).toMatchObject({ status: 'pending', reason: 'network', attempts: 1 });
        await f.due();
        await deliverNextConversion(
            f.adapter,
            () => true,
            () => Promise.resolve(null)
        );
        expect(f.send).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(await f.row())).not.toContain('secret response');
        await f.due();
        await deliverNextConversion(
            f.adapter,
            () => true,
            () => Promise.resolve(f.permission)
        );
        expect(f.send.mock.calls[1]).toEqual(f.send.mock.calls[0]);
    });

    it('fails closed when lookup throws and respects the kill switch before dispatch', async () => {
        const f = await fixture();
        await deliverNextConversion(
            f.adapter,
            () => true,
            () => Promise.reject(new Error('db unavailable'))
        );
        expect(f.send).not.toHaveBeenCalled();
        await f.due();
        await deliverNextConversion(
            f.adapter,
            () => false,
            () => Promise.resolve(f.permission)
        );
        expect(f.send).not.toHaveBeenCalled();
        let enabled = true;
        await deliverNextConversion(
            f.adapter,
            () => enabled,
            () => {
                enabled = false;
                return Promise.resolve(f.permission);
            }
        );
        expect(f.send).not.toHaveBeenCalled();
    });

    it('rejects preview origins, missing context and changed destination', async () => {
        const f = await fixture();
        f.permission.context.browser = { userAgent: 'Browser', sourceUrl: 'https://pr-162.next.nango.dev/signup' };
        await deliverNextConversion(
            f.adapter,
            () => true,
            () => Promise.resolve(f.permission)
        );
        expect(await f.row()).toMatchObject({ status: 'skipped', reason: 'ineligible_signup' });
        expect(f.send).not.toHaveBeenCalled();
        const next = await fixture();
        await deliverNextConversion(
            { ...next.adapter, destination: 'other' },
            () => true,
            () => Promise.resolve(next.permission)
        );
        expect(await next.row()).toMatchObject({ status: 'skipped', reason: 'configuration_changed' });
        expect(next.send).not.toHaveBeenCalled();
        const missing = await fixture();
        await deliverNextConversion(
            { ...missing.adapter, prepare: () => null },
            () => true,
            () => Promise.resolve(missing.permission)
        );
        expect(await missing.row()).toMatchObject({ status: 'skipped', reason: 'missing_context' });
    });

    it('bounds age and attempts, recovers an abandoned lease and never replays an accepted record', async () => {
        const f = await fixture();
        await db
            .knex('signup_ad_conversions')
            .where({ account_id: f.account.id })
            .update({ lease_id: randomUUID(), lease_until: new Date(0) });
        await deliverNextConversion(
            f.adapter,
            () => true,
            () => Promise.resolve(f.permission)
        );
        expect(f.send).toHaveBeenCalledTimes(1);
        const old = await fixture();
        await db
            .knex('signup_ad_conversions')
            .where({ account_id: old.account.id })
            .update({ expires_at: new Date(0) });
        await deliverNextConversion(
            old.adapter,
            () => true,
            () => Promise.resolve(old.permission)
        );
        expect(await old.row()).toMatchObject({ status: 'expired', reason: 'age_limit' });
        expect(old.send).not.toHaveBeenCalled();
        const exhausted = await fixture();
        await db.knex('signup_ad_conversions').where({ account_id: exhausted.account.id }).update({ attempts: 8 });
        await deliverNextConversion(
            exhausted.adapter,
            () => true,
            () => Promise.resolve(exhausted.permission)
        );
        expect(await exhausted.row()).toMatchObject({ status: 'unconfirmed', reason: 'attempt_limit' });
        expect(exhausted.send).not.toHaveBeenCalled();
    });

    it('does not queue pre-launch, expired or non-ad signups', async () => {
        const f = await fixture();
        await db.knex('signup_ad_conversions').where({ account_id: f.account.id }).delete();
        await enqueueConversions({ ...f.adapter, startAt: new Date(Date.now() + 60_000) });
        expect(await f.row()).toBeUndefined();
        await db.knex('signup_advertising_consents').where({ account_id: f.account.id }).update({ click_context: {} });
        await enqueueConversions(f.adapter);
        expect(await f.row()).toBeUndefined();
    });
});

it('polls a submitted Google request without sending the conversion again', async () => {
    const f = await fixture();
    f.send.mockResolvedValue({ status: 'submitted', receiptId: 'google-request' });
    const checkReceipt = vi
        .fn<NonNullable<ConversionAdapter['checkReceipt']>>()
        .mockResolvedValueOnce({ status: 'retry', reason: 'unconfirmed' })
        .mockResolvedValueOnce({ status: 'accepted', receiptId: 'google-request' });
    const google = { ...f.adapter, checkReceipt };
    await deliverNextConversion(
        google,
        () => true,
        () => Promise.resolve(f.permission)
    );
    expect(await f.row()).toMatchObject({ status: 'submitted', receipt_id: 'google-request' });
    await f.due();
    await deliverNextConversion(
        google,
        () => true,
        () => Promise.resolve(null)
    );
    expect(await f.row()).toMatchObject({ status: 'submitted' });
    await f.due();
    await deliverNextConversion(
        google,
        () => true,
        () => Promise.resolve(null)
    );
    expect(await f.row()).toMatchObject({ status: 'accepted' });
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(checkReceipt).toHaveBeenCalledTimes(2);
});

it('does not overwrite a newer worker claim with a stale acknowledgement', async () => {
    const f = await fixture();
    const newerLease = randomUUID();
    f.send.mockImplementationOnce(async () => {
        await db.knex('signup_ad_conversions').where({ account_id: f.account.id }).update({ lease_id: newerLease });
        return { status: 'accepted' };
    });
    await deliverNextConversion(
        f.adapter,
        () => true,
        () => Promise.resolve(f.permission)
    );
    expect(await f.row()).toMatchObject({ status: 'pending', lease_id: newerLease });
});

it('rechecks consent before re-ingestion and records a lost-ack duplicate without another retry', async () => {
    const f = await fixture();
    f.send.mockResolvedValue({ status: 'submitted', receiptId: 'google-request' });
    const checkReceipt = vi
        .fn<NonNullable<ConversionAdapter['checkReceipt']>>()
        .mockResolvedValueOnce({ status: 'retry_ingestion', reason: 'processing_delay' })
        .mockResolvedValueOnce({ status: 'duplicate', receiptId: 'google-request' });
    const adapter = { ...f.adapter, checkReceipt };
    await deliverNextConversion(
        adapter,
        () => true,
        () => Promise.resolve(f.permission)
    );
    await f.due();
    await deliverNextConversion(
        adapter,
        () => true,
        () => Promise.resolve(f.permission)
    );
    expect(await f.row()).toMatchObject({ status: 'pending', receipt_id: null, attempts: 1 });
    await f.due();
    await deliverNextConversion(
        adapter,
        () => true,
        () => Promise.resolve(null)
    );
    expect(f.send).toHaveBeenCalledTimes(1);
    await f.due();
    await deliverNextConversion(
        adapter,
        () => true,
        () => Promise.resolve(f.permission)
    );
    expect(f.send.mock.calls[1]).toEqual(f.send.mock.calls[0]);
    await f.due();
    await deliverNextConversion(
        adapter,
        () => true,
        () => Promise.resolve(f.permission)
    );
    expect(await f.row()).toMatchObject({ status: 'duplicate', reason: 'already_recorded' });
    await f.due();
    await deliverNextConversion(
        adapter,
        () => true,
        () => Promise.resolve(f.permission)
    );
    expect(f.send).toHaveBeenCalledTimes(2);
});

it('keeps polling accepted requests after the send deadline without mislabeling them unsent', async () => {
    const f = await fixture();
    f.send.mockResolvedValue({ status: 'submitted', receiptId: 'request' });
    const checkReceipt = vi.fn<NonNullable<ConversionAdapter['checkReceipt']>>().mockResolvedValue({ status: 'retry', reason: 'unconfirmed' });
    const adapter = { ...f.adapter, checkReceipt };
    await deliverNextConversion(
        adapter,
        () => true,
        () => Promise.resolve(f.permission)
    );
    await db
        .knex('signup_ad_conversions')
        .where({ account_id: f.account.id })
        .update({ expires_at: new Date(0) });
    await f.due();
    await deliverNextConversion(
        adapter,
        () => true,
        () => Promise.resolve(null)
    );
    expect(checkReceipt).toHaveBeenCalledOnce();
    expect(await f.row()).toMatchObject({ status: 'submitted' });
    await db
        .knex('signup_ad_conversions')
        .where({ account_id: f.account.id })
        .update({ submitted_at: new Date(0) });
    await f.due();
    await deliverNextConversion(
        adapter,
        () => true,
        () => Promise.resolve(null)
    );
    expect(await f.row()).toMatchObject({ status: 'unconfirmed', reason: 'receipt_deadline' });
    expect(f.send).toHaveBeenCalledOnce();
});
