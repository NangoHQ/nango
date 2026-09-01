import ms from 'ms';
import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { seedAccountEnvAndUser } from '../../seeders/global.seeder.js';
import { getPlan, handlePlanChanged } from './plans.js';

describe('handlePlanChanged', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('reports no change when the plan is already the one requested', async () => {
        const { account, plan } = await seedAccountEnvAndUser();

        const res = await handlePlanChanged(db.knex, account, { newPlanCode: plan.name, orbSubscriptionId: 'orb_sub_1' });

        expect(res.unwrap()).toBe(false);
    });

    it('reports a change and applies the new plan', async () => {
        const { account } = await seedAccountEnvAndUser();

        const res = await handlePlanChanged(db.knex, account, { newPlanCode: 'growth-v2', orbSubscriptionId: 'orb_sub_2' });

        expect(res.unwrap()).toBe(true);
        const updated = await getPlan(db.knex, { accountId: account.id });
        expect(updated.unwrap().name).toBe('growth-v2');
        expect(updated.unwrap().orb_subscription_id).toBe('orb_sub_2');
    });

    it('clears the trial and applies the paid flags when a free account moves to pay-as-you-go', async () => {
        const { account } = await seedAccountEnvAndUser({
            plan: { name: 'free', auto_idle: true, trial_start_at: new Date(), trial_end_at: new Date(Date.now() + ms('10days')) }
        });

        const res = await handlePlanChanged(db.knex, account, { newPlanCode: 'pay-as-you-go', orbSubscriptionId: 'orb_sub_payg' });

        expect(res.unwrap()).toBe(true);
        const updated = (await getPlan(db.knex, { accountId: account.id })).unwrap();
        expect(updated.name).toBe('pay-as-you-go');
        expect(updated.orb_subscription_id).toBe('orb_sub_payg');
        expect(updated.orb_subscribed_at).not.toBeNull();
        // The trial cron pauses syncs on any plan still flagged auto_idle, so a paid plan has to clear both
        expect(updated.auto_idle).toBe(false);
        expect(updated.trial_start_at).toBeNull();
        expect(updated.trial_end_at).toBeNull();
        expect(updated.trial_expired).toBeNull();
        // Uncapped, metered through Orb instead
        expect(updated.connections_max).toBeNull();
        expect(updated.records_max).toBeNull();
        // Growth features stay off until the add-on exists
        expect(updated.has_rbac).toBe(false);
        expect(updated.has_otel).toBe(false);
    });

    it('restarts the trial and resets the flags when pay-as-you-go downgrades to free', async () => {
        const { account } = await seedAccountEnvAndUser({ plan: { name: 'pay-as-you-go', auto_idle: false, connections_max: null } });

        const res = await handlePlanChanged(db.knex, account, { newPlanCode: 'free', orbSubscriptionId: 'orb_sub_free' });

        expect(res.unwrap()).toBe(true);
        const updated = (await getPlan(db.knex, { accountId: account.id })).unwrap();
        expect(updated.name).toBe('free');
        expect(updated.auto_idle).toBe(true);
        expect(updated.trial_end_at).not.toBeNull();
        expect(updated.trial_expired).toBe(false);
        // pg hands back the bigint column as a string
        expect(Number(updated.connections_max)).toBe(10);
    });
});
