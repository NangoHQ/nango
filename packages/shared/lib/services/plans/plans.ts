import ms from 'ms';

import type { DBPlan } from '@nangohq/types';
import type { Knex } from 'knex';

const TRIAL_DURATION = ms('15days');

export async function getPlan(db: Knex, { accountId }: { accountId: number }): Promise<DBPlan | null> {
    const res = await db.from<DBPlan>('plans').select<DBPlan>('*').where('account_id', accountId).first();
    return res || null;
}

export async function createPlan(
    db: Knex,
    { account_id, ...rest }: Pick<DBPlan, 'account_id'> & Partial<Omit<DBPlan, 'account_id' | 'created_at' | 'updated_at'>>
) {
    await db
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
        .ignore();
}

export async function getTrialCloseToFinish(db: Knex, { inDays }: { inDays: number }): Promise<DBPlan[]> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() + inDays);

    const q = db.from<DBPlan>('plans').select<DBPlan[]>('plans.*').join('_nango_accounts', 'id', 'account_id').where('trial_end_at', '<=', 'dateThreshold');
    console.log(q.toQuery());
    return await q;
}
