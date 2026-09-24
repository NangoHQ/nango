import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { getPlan, seeders, updatePlan } from '@nangohq/shared';
import { metrics } from '@nangohq/utils';

import { exec } from './manageGrowthAddons.js';

import type { DBPlan } from '@nangohq/types';

async function seedPlan(plan: Partial<DBPlan>): Promise<DBPlan> {
    const seed = await seeders.seedAccountEnvAndUser();
    const updated = await updatePlan(db.knex, { id: seed.plan.id, ...plan });
    if (updated.isErr()) {
        throw updated.error;
    }
    return (await getPlan(db.knex, { accountId: seed.account.id })).unwrap();
}

describe('manageGrowthAddonsCron exec', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reports only plans that are not eligible for the growth add-on', async () => {
        const gauge = vi.spyOn(metrics, 'gauge');

        const validPlanConfigs: Partial<DBPlan>[] = [
            { name: 'pay-as-you-go', has_growth_features: true },
            { name: 'pay-as-you-go', has_growth_features: true, orb_future_plan: 'free' },
            { name: 'growth-v2', has_growth_features: true, orb_future_plan: 'pay-as-you-go' },
            { name: 'startup-deal', has_growth_features: true, orb_future_plan: 'pay-as-you-go' }
        ];
        const corruptedPlanConfigs: Partial<DBPlan>[] = [
            { name: 'free', has_growth_features: true },
            { name: 'growth-v2', has_growth_features: true },
            { name: 'startup-deal', has_growth_features: true, orb_future_plan: 'free' }
        ];

        for (const config of [...validPlanConfigs, ...corruptedPlanConfigs]) {
            await seedPlan(config);
        }

        await exec();

        expect(gauge).toHaveBeenCalledWith(metrics.Types.GROWTH_ADDON_CORRUPTED_STATE_COUNT, corruptedPlanConfigs.length);
    });

    it('enables the growth add-on at its scheduled time', async () => {
        const scheduledAt = new Date('2026-10-01T00:00:00.000Z');
        const paygActivation = await seedPlan({ name: 'pay-as-you-go', has_growth_features: false, growth_features_starts_at: scheduledAt });
        const temporaryActivation = await seedPlan({
            name: 'growth-v2',
            has_growth_features: false,
            growth_features_starts_at: scheduledAt,
            orb_future_plan: 'pay-as-you-go'
        });

        await exec(scheduledAt);

        for (const plan of [paygActivation, temporaryActivation]) {
            const updated = (await getPlan(db.knex, { accountId: plan.account_id })).unwrap();
            expect(updated).toMatchObject({
                has_growth_features: true,
                growth_features_starts_at: null,
                has_otel: true,
                has_rbac: true,
                can_override_docs_connect_url: true,
                can_customize_connect_ui_theme: true,
                can_disable_connect_ui_watermark: true
            });
        }
    });

    it('disables the growth add-on at its scheduled time', async () => {
        const scheduledAt = new Date('2026-10-01T00:00:00.000Z');
        const deactivation = await seedPlan({ name: 'pay-as-you-go', has_growth_features: true, growth_features_ends_at: scheduledAt });

        await exec(scheduledAt);

        const updated = (await getPlan(db.knex, { accountId: deactivation.account_id })).unwrap();
        expect(updated).toMatchObject({
            has_growth_features: false,
            growth_features_ends_at: null,
            has_otel: false,
            has_rbac: false,
            can_override_docs_connect_url: false,
            can_customize_connect_ui_theme: false,
            can_disable_connect_ui_watermark: false
        });
    });
});
