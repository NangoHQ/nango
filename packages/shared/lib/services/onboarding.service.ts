import type { DBOnboarding } from '@nangohq/types';
import db, { dbNamespace } from '@nangohq/database';

const TABLE = `${dbNamespace}onboarding_demo_progress`;

export async function completeOnboarding(userId: number): Promise<void> {
    await db.knex
        .from<Required<DBOnboarding>>(TABLE)
        .insert({
            user_id: userId,
            progress: 0,
            complete: true
        })
        .onConflict(['user_id'])
        .merge({ complete: true, updated_at: new Date() });
}

export async function getOnboarding(userId: number): Promise<DBOnboarding | null> {
    const res = await db.knex.from<Required<DBOnboarding>>(TABLE).select<DBOnboarding>('*').where({ user_id: userId }).first();
    return res || null;
}
