import { Err, Ok, stringifyError } from '@nangohq/utils';

import type { Result } from '@nangohq/utils';
import type knex from 'knex';

export const CONCURRENCY_OVERRIDES_TABLE = 'concurrency_overrides';

export interface ConcurrencyOverride {
    group_key: string;
    max_concurrency: number;
    created_at?: Date;
    updated_at?: Date;
}

/**
 * Set (upsert) the max concurrency override for a group.
 * Enforcement reads this live at dequeue, so a change applies to already-queued tasks too.
 */
export async function set(db: knex.Knex, { groupKey, maxConcurrency }: { groupKey: string; maxConcurrency: number }): Promise<Result<void>> {
    try {
        await db
            .from<ConcurrencyOverride>(CONCURRENCY_OVERRIDES_TABLE)
            .insert({ group_key: groupKey, max_concurrency: maxConcurrency })
            .onConflict('group_key')
            .merge({ max_concurrency: maxConcurrency, updated_at: new Date() });
        return Ok(undefined);
    } catch (err) {
        return Err(new Error(`Error setting concurrency override for '${groupKey}': ${stringifyError(err)}`));
    }
}

export async function remove(db: knex.Knex, groupKey: string): Promise<Result<void>> {
    try {
        await db.from<ConcurrencyOverride>(CONCURRENCY_OVERRIDES_TABLE).where('group_key', groupKey).delete();
        return Ok(undefined);
    } catch (err) {
        return Err(new Error(`Error removing concurrency override for '${groupKey}': ${stringifyError(err)}`));
    }
}

export async function getAll(db: knex.Knex): Promise<Result<ConcurrencyOverride[]>> {
    try {
        const rows = await db.from<ConcurrencyOverride>(CONCURRENCY_OVERRIDES_TABLE).select('group_key', 'max_concurrency');
        return Ok(rows);
    } catch (err) {
        return Err(new Error(`Error getting concurrency overrides: ${stringifyError(err)}`));
    }
}
