import ms from 'ms';

import type { DBPlan } from '@nangohq/types';
import type { Knex } from 'knex';

export const TRIAL_DURATION = ms('15days');

export async function getPlan(db: Knex, { accountId }: { accountId: number }): Promise<DBPlan | null> {
    const res = await db.from<DBPlan>('plans').select<DBPlan>('*').where('account_id', accountId).first();
    return res || null;
}

export async function createPlan(
    db: Knex,
    { account_id, ...rest }: Pick<DBPlan, 'account_id' | 'name'> & Partial<Omit<DBPlan, 'account_id' | 'created_at' | 'updated_at'>>
): Promise<DBPlan> {
    const res = await db
        .from<DBPlan>('plans')
        .insert({
            trial_start_at: new Date(),
            trial_end_at: new Date(Date.now() + TRIAL_DURATION),
            ...rest,
            created_at: new Date(),
            updated_at: new Date(),
            account_id
        })
        .onConflict('account_id')
        .ignore()
        .returning('*');
    return res[0]!;
}

export async function updatePlan(db: Knex, { id, ...data }: Pick<DBPlan, 'id'> & Partial<Omit<DBPlan, 'id'>>) {
    await db
        .from<DBPlan>('plans')
        .where('id', id)
        .update({ ...data, updated_at: new Date() });
}

export async function getTrialCloseToFinish(db: Knex, { inDays }: { inDays: number }): Promise<DBPlan[]> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() + inDays);

    return await db
        .from<DBPlan>('plans')
        .select<DBPlan[]>('plans.*')
        .join('_nango_accounts', '_nango_accounts.id', 'plans.account_id')
        .where('trial_end_at', '<=', dateThreshold.toISOString())
        .whereNull('trial_end_notified_at');
}
