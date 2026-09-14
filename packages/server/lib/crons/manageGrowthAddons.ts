import * as cron from 'node-cron';

import db from '@nangohq/database';
import { getLocking } from '@nangohq/kvstore';
import { PLANS_WITH_GROWTH_ADD_ON } from '@nangohq/shared';
import { flagHasPlan, getLogger, metrics } from '@nangohq/utils';

import type { Lock } from '@nangohq/kvstore';
import type { DBPlan } from '@nangohq/types';

const logger = getLogger('cron.growthFeatures');

const cronMinutes = 60;
const cronExpression = `*/${cronMinutes} * * * *`;
const lockTtlMs = cronMinutes * 60 * 1000;

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

export async function exec(now = new Date()): Promise<void> {
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
        await enableGrowthAddon(now);
        await disableGrowthAddon(now);
    } finally {
        try {
            await locking.release(lock);
        } catch (err) {
            logger.error('Error releasing lock', { lock: lock.key, error: err });
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

async function enableGrowthAddon(snapshot: Date) {
    const enabled = await db.knex
        .from<DBPlan>('plans')
        .whereIn('name', PLANS_WITH_GROWTH_ADD_ON)
        .whereNotNull('growth_features_starts_at')
        .where('growth_features_starts_at', '<=', snapshot)
        .update({ has_growth_features: true, growth_features_starts_at: null, updated_at: db.knex.fn.now() })
        .returning('*');

    if (enabled.length > 0) {
        logger.info('Enabled growth add-on for accounts.', { accountIds: enabled.map((p) => p.account_id) });
    }
}

async function disableGrowthAddon(snapshot: Date) {
    const disabled = await db.knex
        .from<DBPlan>('plans')
        .where('has_growth_features', true)
        .whereNotNull('growth_features_ends_at')
        .where('growth_features_ends_at', '<=', snapshot)
        .update({ has_growth_features: false, growth_features_ends_at: null, updated_at: db.knex.fn.now() })
        .returning('*');

    if (disabled.length > 0) {
        logger.info('Disabled growth add-on for accounts.', { accountIds: disabled.map((p) => p.account_id) });
    }
}
