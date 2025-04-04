import ms from 'ms';

import { Err, Ok } from '@nangohq/utils';

import type { DBPlan } from '@nangohq/types';
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

export async function createPlan(
    db: Knex,
    { account_id, ...rest }: Pick<DBPlan, 'account_id' | 'name'> & Partial<Omit<DBPlan, 'account_id' | 'created_at' | 'updated_at'>>
): Promise<Result<DBPlan>> {
    try {
        const res = await db
            .from<DBPlan>('plans')
            .insert({
                trial_start_at: new Date(),
                trial_end_at: new Date(Date.now() + TRIAL_DURATION),
                connection_with_scripts_max: 50,
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

export async function getAccountWithFinishedTrialAndSyncs(db: Knex): Promise<{ account_id: number; environment_id: number; sync_config_id: number }[]> {
    return await db
        .from('_nango_accounts as na')
        .select<{ account_id: number; sync_config_id: number; environment_id: number }[]>(
            'na.id as account_id',
            'nsc.environment_id',
            'nsc.id as sync_config_id'
        )
        .join('plans', 'plans.account_id', 'na.id')
        .join('_nango_environments as ne', 'ne.account_id', 'na.id')
        .join('_nango_sync_configs as nsc', 'nsc.environment_id', 'ne.id')
        .where('plans.name', 'free')
        .whereBetween('plans.trial_end_at', [db.raw("NOW() - INTERVAL '24 hours'"), db.raw('NOW()')])
        .where('nsc.active', true)
        .where('nsc.deleted', false)
        .where('nsc.enabled', true);
}
