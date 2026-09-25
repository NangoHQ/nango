import * as cron from 'node-cron';

import db from '@nangohq/database';
import { getLocking } from '@nangohq/kvstore';
import { getGrowthAddonFlags, getPlanDefinition, PLANS_ALLOWED_TO_HAVE_GROWTH_ADDON, plansList } from '@nangohq/shared';
import { flagHasPlan, getLogger, metrics } from '@nangohq/utils';

import { envs } from '../env.js';

import type { Lock } from '@nangohq/kvstore';
import type { DBPlan, PlanDefinition } from '@nangohq/types';

const logger = getLogger('cron.manageGrowthAddons');

const cronMinutes = envs.CRON_MANAGE_GROWTH_ADDONS_EVERY_MIN;
const cronExpression = `*/${cronMinutes} * * * *`;
const lockTtlMs = cronMinutes * 60 * 1000;

// Add-on transitions are scheduled a few hours before plan changes take effect so customers experience
// no downtime when migrating from plans such as growth-v2 and startup-deal - where growth features are
// already available - into PAYG + add-on. Thus these plans are allowed to have the `has_growth_features`
// flag enabled if a future change into PAYG is scheduled.
const PLANS_ALLOWED_TO_TEMPORARILY_HAVE_GROWTH_ADD_ON: PlanDefinition['code'][] = ['growth-v2', 'startup-deal'];
const PLANS_ALLOWED_TO_ENABLE_GROWTH_ADD_ON = [...new Set([...PLANS_ALLOWED_TO_HAVE_GROWTH_ADDON, ...PLANS_ALLOWED_TO_TEMPORARILY_HAVE_GROWTH_ADD_ON])];

type GrowthAddonSchedulingColumn = keyof Pick<DBPlan, 'growth_features_starts_at' | 'growth_features_ends_at'>;
type GrowthAddonOperation = 'enable' | 'disable';

const growthAddonOperations = {
    enable: { hasGrowthFeatures: true, schedulingColumn: 'growth_features_starts_at' },
    disable: { hasGrowthFeatures: false, schedulingColumn: 'growth_features_ends_at' }
} as const satisfies Record<GrowthAddonOperation, { hasGrowthFeatures: boolean; schedulingColumn: GrowthAddonSchedulingColumn }>;

export function manageGrowthAddonsCron(): void {
    // set env var CRON_MANAGE_GROWTH_ADDONS_EVERY_MIN to 0 to disable
    if (!flagHasPlan || cronMinutes <= 0) {
        return;
    }

    cron.schedule(cronExpression, async () => {
        const startedAt = process.hrtime.bigint();
        const date = new Date();
        let success = true;
        try {
            await exec(date);
        } catch (err) {
            success = false;
            logger.error('Failed to execute growth add-on management cron', { err });
        } finally {
            metrics.duration(metrics.Types.CRON_MANAGE_GROWTH_ADDON, Number(process.hrtime.bigint() - startedAt) / 1e6, { success: String(success) });
            logger.info(success ? '✅ done' : '❌ failed');
        }
    });
}

export async function exec(date = new Date()): Promise<void> {
    const locking = await getLocking();
    let lock: Lock | undefined;
    try {
        lock = await locking.acquire('lock:growthFeatures:cron', lockTtlMs);
    } catch (err) {
        logger.info('Could not acquire lock, skipping', err);
        return;
    }

    try {
        await reportCorruptedPlans();
        await enableGrowthAddon(date);
        await disableGrowthAddon(date);
    } finally {
        try {
            await locking.release(lock);
        } catch (err) {
            logger.error('Error releasing growth add-on cron lock', { lock: lock.key, err });
        }
    }
}

/**
 * A plan with growth features enabled is valid when either:
 * - its current plan supports the growth add-on; or
 * - it is temporarily allowed to retain the add-on while Orb has scheduled a
 *   transition to an add-on-capable plan.
 *
 * Reports every other plan as corrupted.
 */
async function reportCorruptedPlans() {
    const corrupted = await db.knex
        .from<Pick<DBPlan, 'id' | 'account_id' | 'name'>>('plans')
        .select('id', 'account_id', 'name')
        .where('has_growth_features', true)
        .whereNotIn('name', PLANS_ALLOWED_TO_HAVE_GROWTH_ADDON)
        .where((query) => {
            query
                .whereNotIn('name', PLANS_ALLOWED_TO_TEMPORARILY_HAVE_GROWTH_ADD_ON)
                .orWhereNull('orb_future_plan')
                .orWhereNotIn('orb_future_plan', PLANS_ALLOWED_TO_HAVE_GROWTH_ADDON);
        });

    if (corrupted.length > 0) {
        for (const plan of corrupted) {
            logger.error('Growth features enabled for a plan that does not support the add-on', {
                planId: plan.id,
                accountId: plan.account_id,
                planName: plan.name
            });
        }
    }

    metrics.gauge(metrics.Types.GROWTH_ADDON_CORRUPTED_STATE_COUNT, corrupted.length);
}

async function enableGrowthAddon(date: Date) {
    const accountIds = await updateGrowthAddonState(date, 'enable');
    if (accountIds.length > 0) {
        logger.info('Enabled growth add-on for accounts.', { accountIds: accountIds });
    }
}

async function disableGrowthAddon(date: Date) {
    const accountIds = await updateGrowthAddonState(date, 'disable');
    if (accountIds.length > 0) {
        logger.info('Disabled growth add-on for accounts.', { accountIds: accountIds });
    }
}

async function updateGrowthAddonState(date: Date, operation: GrowthAddonOperation): Promise<number[]> {
    const { hasGrowthFeatures, schedulingColumn } = growthAddonOperations[operation];
    const accountIds = await Promise.all(
        getPlansToFilterBy(operation).map(async (plan) => {
            const addonFlags = getGrowthAddonFlags(plan, hasGrowthFeatures);

            const updated = await db.knex
                .from<DBPlan>('plans')
                .where('name', plan.code)
                .whereNotNull(schedulingColumn)
                .where(schedulingColumn, '<=', date)
                .update({
                    has_growth_features: hasGrowthFeatures,
                    [schedulingColumn]: null,
                    ...addonFlags,
                    updated_at: db.knex.fn.now()
                })
                .returning('account_id');

            return updated.map((plan) => plan.account_id);
        })
    );
    return accountIds.flat();
}

function getPlansToFilterBy(operation: GrowthAddonOperation): PlanDefinition[] {
    if (operation === 'disable') {
        return plansList;
    }

    return PLANS_ALLOWED_TO_ENABLE_GROWTH_ADD_ON.map((planCode) => {
        const definition = getPlanDefinition(planCode);
        if (!definition) {
            throw new Error(`Missing plan definition for ${planCode}`);
        }
        return definition;
    });
}
