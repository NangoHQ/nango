import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { seedAccountEnvAndUser } from '../../seeders/global.seeder.js';
import {
    claimSpendAlertNotification,
    markSpendAlertNotified,
    releaseSpendAlertNotification,
    SPEND_ALERT_CLAIM_LEASE_MINUTES,
    SPEND_ALERT_NOTIFICATIONS_TABLE
} from './spendAlertNotifications.js';

const timeframeStart = new Date('2026-08-01T00:00:00.000Z');

/** Backdates a claim so the lease reads as lapsed, standing in for a delivery that died mid-send. */
async function ageClaim(accountId: number, minutes: number) {
    await db.knex
        .from(SPEND_ALERT_NOTIFICATIONS_TABLE)
        .where({ account_id: accountId })
        .update({ created_at: new Date(Date.now() - minutes * 60 * 1000) });
}

describe('spend alert notifications', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('claims once per threshold per period', async () => {
        const { account } = await seedAccountEnvAndUser();
        const key = { accountId: account.id, thresholdInCents: 5000, timeframeStart };

        const first = await claimSpendAlertNotification(db.knex, key);
        const second = await claimSpendAlertNotification(db.knex, key);

        expect(first.unwrap()).toBe(true);
        // The whole point: an Orb redelivery must not produce a second email.
        expect(second.unwrap()).toBe(false);
    });

    it('keeps a sent notification claimed even once the lease has lapsed', async () => {
        const { account } = await seedAccountEnvAndUser();
        const key = { accountId: account.id, thresholdInCents: 5000, timeframeStart };

        await claimSpendAlertNotification(db.knex, key);
        await markSpendAlertNotified(db.knex, key);
        await ageClaim(account.id, SPEND_ALERT_CLAIM_LEASE_MINUTES + 1);

        expect((await claimSpendAlertNotification(db.knex, key)).unwrap()).toBe(false);
    });

    it('takes over a claim abandoned mid-send', async () => {
        // The crash case: claimed, then the process died before the email went out.
        const { account } = await seedAccountEnvAndUser();
        const key = { accountId: account.id, thresholdInCents: 5000, timeframeStart };

        await claimSpendAlertNotification(db.knex, key);
        await ageClaim(account.id, SPEND_ALERT_CLAIM_LEASE_MINUTES + 1);

        expect((await claimSpendAlertNotification(db.knex, key)).unwrap()).toBe(true);
    });

    it('holds the claim against a concurrent delivery while the lease is live', async () => {
        const { account } = await seedAccountEnvAndUser();
        const key = { accountId: account.id, thresholdInCents: 5000, timeframeStart };

        const [a, b] = await Promise.all([claimSpendAlertNotification(db.knex, key), claimSpendAlertNotification(db.knex, key)]);

        expect([a.unwrap(), b.unwrap()].filter(Boolean)).toHaveLength(1);
    });

    it('claims separately for a different threshold, period or account', async () => {
        const { account } = await seedAccountEnvAndUser();
        const other = await seedAccountEnvAndUser();

        expect((await claimSpendAlertNotification(db.knex, { accountId: account.id, thresholdInCents: 5000, timeframeStart })).unwrap()).toBe(true);
        expect((await claimSpendAlertNotification(db.knex, { accountId: account.id, thresholdInCents: 10000, timeframeStart })).unwrap()).toBe(true);
        expect(
            (
                await claimSpendAlertNotification(db.knex, {
                    accountId: account.id,
                    thresholdInCents: 5000,
                    timeframeStart: new Date('2026-09-01T00:00:00.000Z')
                })
            ).unwrap()
        ).toBe(true);
        expect((await claimSpendAlertNotification(db.knex, { accountId: other.account.id, thresholdInCents: 5000, timeframeStart })).unwrap()).toBe(true);
    });

    it('will not release a claim that was already sent', async () => {
        const { account } = await seedAccountEnvAndUser();
        const key = { accountId: account.id, thresholdInCents: 5000, timeframeStart };

        await claimSpendAlertNotification(db.knex, key);
        await markSpendAlertNotified(db.knex, key);
        await releaseSpendAlertNotification(db.knex, key);

        expect((await claimSpendAlertNotification(db.knex, key)).unwrap()).toBe(false);
    });

    it('lets a released claim be taken again', async () => {
        const { account } = await seedAccountEnvAndUser();
        const key = { accountId: account.id, thresholdInCents: 5000, timeframeStart };

        await claimSpendAlertNotification(db.knex, key);
        const released = await releaseSpendAlertNotification(db.knex, key);

        expect(released.isOk()).toBe(true);
        expect((await claimSpendAlertNotification(db.knex, key)).unwrap()).toBe(true);
    });

    it('releases only the matching claim', async () => {
        const { account } = await seedAccountEnvAndUser();
        await claimSpendAlertNotification(db.knex, { accountId: account.id, thresholdInCents: 5000, timeframeStart });
        await claimSpendAlertNotification(db.knex, { accountId: account.id, thresholdInCents: 10000, timeframeStart });

        await releaseSpendAlertNotification(db.knex, { accountId: account.id, thresholdInCents: 5000, timeframeStart });

        const remaining = await db.knex.from(SPEND_ALERT_NOTIFICATIONS_TABLE).where({ account_id: account.id }).select('threshold_in_cents');
        expect(remaining).toEqual([{ threshold_in_cents: 10000 }]);
    });
});
