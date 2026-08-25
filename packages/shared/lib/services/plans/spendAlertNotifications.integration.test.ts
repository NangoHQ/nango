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

/** Stands in for a delivery that died mid-send. */
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

        expect(first.unwrap()).not.toBeNull();
        expect(second.unwrap()).toBeNull();
    });

    it('keeps a sent notification claimed even once the lease has lapsed', async () => {
        const { account } = await seedAccountEnvAndUser();
        const key = { accountId: account.id, thresholdInCents: 5000, timeframeStart };

        const claim = (await claimSpendAlertNotification(db.knex, key)).unwrap()!;
        await markSpendAlertNotified(db.knex, claim);
        await ageClaim(account.id, SPEND_ALERT_CLAIM_LEASE_MINUTES + 1);

        expect((await claimSpendAlertNotification(db.knex, key)).unwrap()).toBeNull();
    });

    it('takes over a claim abandoned mid-send', async () => {
        const { account } = await seedAccountEnvAndUser();
        const key = { accountId: account.id, thresholdInCents: 5000, timeframeStart };

        await claimSpendAlertNotification(db.knex, key);
        await ageClaim(account.id, SPEND_ALERT_CLAIM_LEASE_MINUTES + 1);

        expect((await claimSpendAlertNotification(db.knex, key)).unwrap()).not.toBeNull();
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

        expect((await claimSpendAlertNotification(db.knex, { accountId: account.id, thresholdInCents: 5000, timeframeStart })).unwrap()).not.toBeNull();
        expect((await claimSpendAlertNotification(db.knex, { accountId: account.id, thresholdInCents: 10000, timeframeStart })).unwrap()).not.toBeNull();
        expect(
            (
                await claimSpendAlertNotification(db.knex, {
                    accountId: account.id,
                    thresholdInCents: 5000,
                    timeframeStart: new Date('2026-09-01T00:00:00.000Z')
                })
            ).unwrap()
        ).not.toBeNull();
        expect((await claimSpendAlertNotification(db.knex, { accountId: other.account.id, thresholdInCents: 5000, timeframeStart })).unwrap()).not.toBeNull();
    });

    it('will not let a lapsed worker finalise the claim that replaced it', async () => {
        // The takeover race: the original worker outlives its lease, a redelivery reclaims the row,
        // and the original then tries to mark or release it.
        const { account } = await seedAccountEnvAndUser();
        const key = { accountId: account.id, thresholdInCents: 5000, timeframeStart };

        const lapsed = (await claimSpendAlertNotification(db.knex, key)).unwrap()!;
        await ageClaim(account.id, SPEND_ALERT_CLAIM_LEASE_MINUTES + 1);
        const taken = (await claimSpendAlertNotification(db.knex, key)).unwrap()!;
        expect(taken.token).not.toBe(lapsed.token);

        await markSpendAlertNotified(db.knex, lapsed);
        await releaseSpendAlertNotification(db.knex, lapsed);

        const row = await db.knex.from(SPEND_ALERT_NOTIFICATIONS_TABLE).where({ id: taken.id }).first();
        expect(row).toBeTruthy();
        expect(row.notified_at).toBeNull();
    });

    it('will not release a claim that was already sent', async () => {
        const { account } = await seedAccountEnvAndUser();
        const key = { accountId: account.id, thresholdInCents: 5000, timeframeStart };

        const claim = (await claimSpendAlertNotification(db.knex, key)).unwrap()!;
        await markSpendAlertNotified(db.knex, claim);
        await releaseSpendAlertNotification(db.knex, claim);

        expect((await claimSpendAlertNotification(db.knex, key)).unwrap()).toBeNull();
    });

    it('lets a released claim be taken again', async () => {
        const { account } = await seedAccountEnvAndUser();
        const key = { accountId: account.id, thresholdInCents: 5000, timeframeStart };

        const claim = (await claimSpendAlertNotification(db.knex, key)).unwrap()!;
        const released = await releaseSpendAlertNotification(db.knex, claim);

        expect(released.isOk()).toBe(true);
        expect((await claimSpendAlertNotification(db.knex, key)).unwrap()).not.toBeNull();
    });

    it('releases only the matching claim', async () => {
        const { account } = await seedAccountEnvAndUser();
        const first = (await claimSpendAlertNotification(db.knex, { accountId: account.id, thresholdInCents: 5000, timeframeStart })).unwrap()!;
        await claimSpendAlertNotification(db.knex, { accountId: account.id, thresholdInCents: 10000, timeframeStart });

        await releaseSpendAlertNotification(db.knex, first);

        const remaining = await db.knex.from(SPEND_ALERT_NOTIFICATIONS_TABLE).where({ account_id: account.id }).select('threshold_in_cents');
        expect(remaining).toEqual([{ threshold_in_cents: 10000 }]);
    });
});
