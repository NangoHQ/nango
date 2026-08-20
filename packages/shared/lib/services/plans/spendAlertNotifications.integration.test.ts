import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { seedAccountEnvAndUser } from '../../seeders/global.seeder.js';
import { claimSpendAlertNotification, releaseSpendAlertNotification, SPEND_ALERT_NOTIFICATIONS_TABLE } from './spendAlertNotifications.js';

const timeframeStart = new Date('2026-08-01T00:00:00.000Z');

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
