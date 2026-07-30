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

/**
 * Fetch the overrides for the given group keys as a map.
 * Used when materializing tasks so the cap is stamped at create time rather than read in the hot dequeue query.
 */
export async function getByGroupKeys(db: knex.Knex, groupKeys: string[]): Promise<Result<Map<string, number>>> {
    if (groupKeys.length === 0) {
        return Ok(new Map());
    }
    try {
        const rows = await db.from<ConcurrencyOverride>(CONCURRENCY_OVERRIDES_TABLE).whereIn('group_key', groupKeys).select('group_key', 'max_concurrency');
        return Ok(new Map(rows.map((r) => [r.group_key, r.max_concurrency])));
    } catch (err) {
        return Err(new Error(`Error getting concurrency overrides: ${stringifyError(err)}`));
    }
}
