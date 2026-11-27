import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { seedAccountEnvAndUser } from '../../seeders/global.seeder.js';
import { createPlan, getPlan, handlePlanChanged, setGrowthAddon, updatePlanByTeam } from './plans.js';

describe('updatePlanByTeam', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('returns the updated plan', async () => {
        const { account, plan } = await seedAccountEnvAndUser();

        const updated = (await updatePlanByTeam(db.knex, { account_id: account.id, name: 'growth-v2' })).unwrap();

        expect(updated).toMatchObject({ id: plan.id, account_id: account.id, name: 'growth-v2' });
    });
});

describe('handlePlanChanged', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('reports no change when the plan is already the one requested', async () => {
        const { account, plan } = await seedAccountEnvAndUser();

        const res = await handlePlanChanged(db.knex, account, {
            newPlanCode: plan.name,
            orbSubscriptionId: 'orb_sub_1'
        });

        expect(res.unwrap()).toBeNull();
    });

    it('returns the existing plan when one already exists for the account', async () => {
        const { account, plan } = await seedAccountEnvAndUser();

        const existingPlan = await createPlan(db.knex, { account_id: account.id, name: 'growth-v2' });

        expect(existingPlan.unwrap()).toMatchObject({ id: plan.id, name: plan.name });
    });

    it('reports a change and applies the new plan', async () => {
        const { account } = await seedAccountEnvAndUser();

        const res = await handlePlanChanged(db.knex, account, {
            newPlanCode: 'growth-v2',
            orbSubscriptionId: 'orb_sub_2'
        });

        expect(res.unwrap()).toMatchObject({
            previousPlan: { name: 'free' },
            updatedPlan: { name: 'growth-v2', orb_subscription_id: 'orb_sub_2' },
            isDowngrade: false
        });
        const updated = await getPlan(db.knex, { accountId: account.id });
        expect(updated.unwrap().name).toBe('growth-v2');
        expect(updated.unwrap().orb_subscription_id).toBe('orb_sub_2');
    });

    it('applies the paid flags when a free account moves to pay-as-you-go', async () => {
        const { account } = await seedAccountEnvAndUser({ plan: { name: 'free' } });

        const res = await handlePlanChanged(db.knex, account, {
            newPlanCode: 'pay-as-you-go',
            orbSubscriptionId: 'orb_sub_payg'
        });

        expect(res.unwrap()).toMatchObject({ isDowngrade: false });
        const updated = (await getPlan(db.knex, { accountId: account.id })).unwrap();
        expect(updated.name).toBe('pay-as-you-go');
        expect(updated.orb_subscription_id).toBe('orb_sub_payg');
        expect(updated.orb_subscribed_at).not.toBeNull();
        // Uncapped, metered through Orb instead
        expect(updated.connections_max).toBeNull();
        expect(updated.records_max).toBeNull();
        // Growth features stay off until the add-on exists
        expect(updated.has_rbac).toBe(false);
        expect(updated.has_otel).toBe(false);
    });

    it('resets the flags when pay-as-you-go downgrades to free', async () => {
        const { account } = await seedAccountEnvAndUser({
            plan: { name: 'pay-as-you-go', connections_max: null, data_transfer_max: null }
        });

        const res = await handlePlanChanged(db.knex, account, {
            newPlanCode: 'free',
            orbSubscriptionId: 'orb_sub_free'
        });

        expect(res.unwrap()).toMatchObject({ isDowngrade: true });
        const updated = (await getPlan(db.knex, { accountId: account.id })).unwrap();
        expect(updated.name).toBe('free');
        expect(updated.connections_max).toBe(10);
        expect(updated.data_transfer_max).toBe(10_000_000_000);
    });

    it('keeps the growth feature set through a plan change while the add-on is active', async () => {
        const { account } = await seedAccountEnvAndUser({
            plan: { name: 'pay-as-you-go', has_growth_features: true, has_rbac: true, has_otel: true }
        });

        const res = await handlePlanChanged(db.knex, account, { newPlanCode: 'growth-v2', orbSubscriptionId: 'orb_sub_addon' });
        expect(res.unwrap()).toMatchObject({
            previousPlan: { name: 'pay-as-you-go', has_growth_features: true },
            updatedPlan: { name: 'growth-v2', has_growth_features: true }
        });

        const updated = (await getPlan(db.knex, { accountId: account.id })).unwrap();
        expect(updated.name).toBe('growth-v2');
        expect(updated.has_growth_features).toBe(true);
    });

    it('leaves add-on state untouched, however stale the caller is', async () => {
        const endsAt = new Date('2026-10-01T00:00:00Z');
        const { account } = await seedAccountEnvAndUser({
            plan: { name: 'pay-as-you-go', has_growth_features: true, growth_features_ends_at: endsAt, has_rbac: true }
        });

        const res = await handlePlanChanged(db.knex, account, { newPlanCode: 'pay-as-you-go', orbSubscriptionId: 'orb_sub_addon' });
        expect(res.unwrap()).toBeNull();

        const updated = (await getPlan(db.knex, { accountId: account.id })).unwrap();
        expect(updated.has_growth_features).toBe(true);
        expect(updated.growth_features_ends_at).toEqual(endsAt);
        expect(updated.has_rbac).toBe(true);
    });
});

describe('setGrowthAddon', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('grants the gated flags when the add-on is turned on', async () => {
        const { account } = await seedAccountEnvAndUser({ plan: { name: 'pay-as-you-go' } });

        (await setGrowthAddon(db.knex, account, { hasGrowthFeatures: true })).unwrap();

        const updated = (await getPlan(db.knex, { accountId: account.id })).unwrap();
        expect(updated.has_growth_features).toBe(true);
        expect(updated.growth_features_ends_at).toBeNull();
        expect(updated.has_otel).toBe(true);
        expect(updated.has_rbac).toBe(true);
        expect(updated.can_customize_connect_ui_theme).toBe(true);
        expect(updated.environments_max).toBe(10);
        expect(updated.api_rate_limit_size).toBe('xl');
    });

    // Scheduling the removal is not the removal: they keep the features through the term they paid for
    it('records the end date while leaving the add-on active', async () => {
        const endsAt = new Date('2026-10-01T00:00:00Z');
        const { account } = await seedAccountEnvAndUser({
            plan: { name: 'pay-as-you-go', has_growth_features: true, has_otel: true, has_rbac: true }
        });

        (await setGrowthAddon(db.knex, account, { hasGrowthFeatures: true, endsAt })).unwrap();

        const updated = (await getPlan(db.knex, { accountId: account.id })).unwrap();
        expect(updated.has_growth_features).toBe(true);
        expect(updated.growth_features_ends_at).toEqual(endsAt);
        expect(updated.has_otel).toBe(true);
    });

    it('revokes the gated flags and clears the date once the add-on is gone', async () => {
        const { account } = await seedAccountEnvAndUser({
            plan: {
                name: 'pay-as-you-go',
                has_growth_features: true,
                growth_features_ends_at: new Date('2026-10-01T00:00:00Z'),
                has_otel: true,
                has_rbac: true,
                environments_max: 10,
                api_rate_limit_size: 'xl'
            }
        });

        (await setGrowthAddon(db.knex, account, { hasGrowthFeatures: false })).unwrap();

        const updated = (await getPlan(db.knex, { accountId: account.id })).unwrap();
        expect(updated.has_growth_features).toBe(false);
        expect(updated.growth_features_ends_at).toBeNull();
        expect(updated.has_otel).toBe(false);
        expect(updated.has_rbac).toBe(false);
        expect(updated.environments_max).toBe(3);
        expect(updated.api_rate_limit_size).toBe('l');
    });

    // Flags the add-on does not gate are none of its business, overrides included
    it('leaves ungated flags alone', async () => {
        const { account } = await seedAccountEnvAndUser({ plan: { name: 'pay-as-you-go', connections_max: 50 } });

        (await setGrowthAddon(db.knex, account, { hasGrowthFeatures: true })).unwrap();

        const updated = (await getPlan(db.knex, { accountId: account.id })).unwrap();
        expect(updated.connections_max).toBe(50);
    });

    it('keeps hand-granted limits above the add-on ones', async () => {
        const { account } = await seedAccountEnvAndUser({
            plan: { name: 'pay-as-you-go', environments_max: 50, api_rate_limit_size: '2xl' }
        });

        (await setGrowthAddon(db.knex, account, { hasGrowthFeatures: true })).unwrap();

        const updated = (await getPlan(db.knex, { accountId: account.id })).unwrap();
        expect(updated.environments_max).toBe(50);
        expect(updated.api_rate_limit_size).toBe('2xl');
    });
});
