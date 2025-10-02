import ms from 'ms';

import { Err, Ok } from '@nangohq/utils';

import { freePlan, plansList } from './definitions.js';
import { productTracking } from '../../utils/productTracking.js';

import type { DBPlan, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export const TRIAL_DURATION = ms('15days');

export async function getPlan(db: Knex, { accountId }: { accountId: number }): Promise<Result<DBPlan>> {
    try {
        const res = await db.from<DBPlan>('plans').select<DBPlan>('*').where('account_id', accountId).first();
        return res ? Ok(res) : Err(new Error('unknown_plan_for_account'));
    } catch (err) {
        return Err(new Error('failed_to_get_plan', { cause: err }));
    }
}

export async function getPlanBy(db: Knex, opts: Partial<Pick<DBPlan, 'stripe_customer_id'>>): Promise<Result<DBPlan>> {
    if (Object.keys(opts).length <= 0) {
        return Err(new Error('getPlanBy_missing_opts'));
    }
    try {
        const query = db.from<DBPlan>('plans').select<DBPlan>('*');
        if (opts.stripe_customer_id) {
            query.where('stripe_customer_id', opts.stripe_customer_id);
        }
        const res = await query.first();
        return res ? Ok(res) : Err(new Error('unknown_plan_for_condition'));
    } catch (err) {
        return Err(new Error('failed_to_get_plan', { cause: err }));
    }
}

export async function createPlan(
    db: Knex,
    { account_id, ...rest }: Pick<DBPlan, 'account_id' | 'name'> & Partial<Omit<DBPlan, 'account_id' | 'created_at' | 'updated_at'>>
): Promise<Result<DBPlan>> {
    try {
        const res = await db
            .from<DBPlan>('plans')
            .insert({
                ...rest,
                created_at: new Date(),
                updated_at: new Date(),
                account_id
            })
            .onConflict('account_id')
            .ignore()
            .returning('*');
        return Ok(res[0]!);
    } catch (err) {
        return Err(new Error('failed_to_create_plan', { cause: err }));
    }
}

export async function updatePlan(db: Knex, { id, ...data }: Pick<DBPlan, 'id'> & Partial<Omit<DBPlan, 'id'>>): Promise<Result<boolean>> {
    try {
        await db
            .from<DBPlan>('plans')
            .where('id', id)
            .update({ ...data, updated_at: new Date() });
        return Ok(true);
    } catch (err) {
        return Err(new Error('failed_to_update_plan', { cause: err }));
    }
}

export async function updatePlanByTeam(
    db: Knex,
    { account_id, ...data }: Pick<DBPlan, 'account_id'> & Partial<Omit<DBPlan, 'id' | 'account_id'>>
): Promise<Result<boolean>> {
    try {
        await db
            .from<DBPlan>('plans')
            .where('account_id', account_id)
            .update({ ...data, updated_at: db.fn.now() });
        return Ok(true);
    } catch (err) {
        return Err(new Error('failed_to_update_plan', { cause: err }));
    }
}

export async function startTrial(db: Knex, plan: DBPlan): Promise<Result<boolean>> {
    return await updatePlan(db, {
        id: plan.id,
        trial_start_at: plan.trial_start_at || new Date(),
        trial_end_at: new Date(Date.now() + TRIAL_DURATION),
        trial_end_notified_at: null,
        trial_extension_count: plan.trial_extension_count + 1,
        trial_expired: false
    });
}

export async function getTrialsApproachingExpiration(db: Knex, { daysLeft }: { daysLeft: number }): Promise<Result<DBPlan[]>> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() + daysLeft);
    try {
        const res = await db
            .from<DBPlan>('plans')
            .select<DBPlan[]>('plans.*')
            .join('_nango_accounts', '_nango_accounts.id', 'plans.account_id')
            .where('trial_end_at', '<=', dateThreshold.toISOString())
            .whereNull('trial_end_notified_at');
        return Ok(res);
    } catch (err) {
        return Err(new Error('failed_to_get_trials', { cause: err }));
    }
}

export async function getExpiredTrials(db: Knex): Promise<DBPlan[]> {
    return await db
        .from('plans')
        .select<DBPlan[]>('*')
        .where('plans.trial_end_at', '<=', db.raw('NOW()'))
        .where((b) => b.where('plans.trial_expired', false).orWhereNull('plans.trial_expired'));
}

export async function handlePlanChanged(
    db: Knex,
    team: DBTeam,
    { newPlanCode, orbCustomerId, orbSubscriptionId }: { newPlanCode: string; orbCustomerId?: string | undefined; orbSubscriptionId: string }
): Promise<Result<boolean>> {
    const newPlan = plansList.find((p) => p.orbId === newPlanCode);
    if (!newPlan) {
        return Err('Received a plan not linked to the plansList');
    }

    const currentPlan = await getPlan(db, { accountId: team.id });
    if (currentPlan.isErr()) {
        return Err(new Error('Failed to get current plan', { cause: currentPlan.error }));
    }

    // Plan hasn't changed
    if (currentPlan.value.name === newPlan.code) {
        return Ok(true);
    }

    // Only update subscription date from free to paid (undefined = no update)
    const isCurrentFree = currentPlan.value.name === freePlan.code;
    const isNewPaid = newPlan.code !== freePlan.code;

    const updated = await updatePlanByTeam(db, {
        account_id: team.id,
        name: newPlan.code as unknown as DBPlan['name'],
        orb_subscription_id: orbSubscriptionId,
        orb_future_plan: null,
        orb_future_plan_at: null,
        ...(orbCustomerId ? { orb_customer_id: orbCustomerId } : {}),
        ...(isCurrentFree && isNewPaid ? { orb_subscribed_at: new Date() } : {}),
        ...newPlan.flags
    });

    if (updated.isErr()) {
        return Err(new Error('Failed to updated plan', { cause: updated.error }));
    }

    productTracking.track({
        name: 'account:billing:plan_changed',
        team,
        eventProperties: { previousPlan: currentPlan.value.name, newPlan: newPlanCode, orbCustomerId: currentPlan.value.orb_customer_id }
    });

    return Ok(true);
}
