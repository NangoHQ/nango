import * as cron from 'node-cron';

import db from '@nangohq/database';
import { getLocking } from '@nangohq/kvstore';
import { getGrowthAddonFlags, getPlanDefinition, PLANS_WITH_GROWTH_ADD_ON, plansList } from '@nangohq/shared';
import { flagHasPlan, getLogger, metrics } from '@nangohq/utils';

import type { Lock } from '@nangohq/kvstore';
import type { DBPlan, PlanDefinition } from '@nangohq/types';

const logger = getLogger('cron.growthFeatures');

const cronMinutes = 60;
const cronExpression = `*/${cronMinutes} * * * *`;
const lockTtlMs = cronMinutes * 60 * 1000;

type GrowthAddonSchedulingColumn = keyof Pick<DBPlan, 'growth_features_starts_at' | 'growth_features_ends_at'>;
type GrowthAddonOperation = 'enable' | 'disable';

const growthAddonOperations = {
    enable: { hasGrowthFeatures: true, schedulingColumn: 'growth_features_starts_at' },
    disable: { hasGrowthFeatures: false, schedulingColumn: 'growth_features_ends_at' }
} as const satisfies Record<GrowthAddonOperation, { hasGrowthFeatures: boolean; schedulingColumn: GrowthAddonSchedulingColumn }>;

export function manageGrowthAddonsCron(): void {
    if (!flagHasPlan) {
        return;
    }

    cron.schedule(cronExpression, async () => {
        const start = Date.now();
        let success = true;
        try {
            await exec();
        } catch (err) {
            success = false;
            logger.error('Failed to execute growth add-on management cron', { err });
        } finally {
            metrics.duration(metrics.Types.CRON_MANAGE_GROWTH_ADDON, Date.now() - start, { success: String(success) });
            logger.info('✅ done');
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

async function reportCorruptedPlans() {
    const corrupted = await db.knex
        .from<Pick<DBPlan, 'id' | 'account_id' | 'name'>>('plans')
        .select('id', 'account_id', 'name')
        .where('has_growth_features', true)
        .whereNotIn('name', PLANS_WITH_GROWTH_ADD_ON);

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

    return PLANS_WITH_GROWTH_ADD_ON.map((planCode) => {
        const definition = getPlanDefinition(planCode);
        if (!definition) {
            throw new Error(`Missing plan definition for ${planCode}`);
        }
        return definition;
    });
}
