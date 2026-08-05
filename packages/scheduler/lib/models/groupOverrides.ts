import { Err, Ok, stringifyError } from '@nangohq/utils';

import type { Result } from '@nangohq/utils';
import type knex from 'knex';

export const GROUP_OVERRIDES_TABLE = 'group_overrides';

export interface GroupOverride {
    group_key: string;
    max_concurrency: number;
    created_at?: Date;
    updated_at?: Date;
}

/**
 * Set the max concurrency override for a group.
 * The value is stamped onto tasks when they are created, so an update only affects tasks created after it,
 * not ones already queued.
 */
export async function upsert(db: knex.Knex, { groupKey, maxConcurrency }: { groupKey: string; maxConcurrency: number }): Promise<Result<void>> {
    try {
        await db
            .from<GroupOverride>(GROUP_OVERRIDES_TABLE)
            .insert({ group_key: groupKey, max_concurrency: maxConcurrency })
            .onConflict('group_key')
            .merge({ max_concurrency: maxConcurrency, updated_at: new Date() });
        return Ok(undefined);
    } catch (err) {
        return Err(new Error(`Error setting group override for '${groupKey}': ${stringifyError(err)}`));
    }
}

export async function remove(db: knex.Knex, groupKey: string): Promise<Result<void>> {
    try {
        await db.from<GroupOverride>(GROUP_OVERRIDES_TABLE).where('group_key', groupKey).delete();
        return Ok(undefined);
    } catch (err) {
        return Err(new Error(`Error removing group override for '${groupKey}': ${stringifyError(err)}`));
    }
}

/**
 * Fetch the overrides for the given group keys as a map.
 */
export async function getByGroupKeys(db: knex.Knex, groupKeys: string[]): Promise<Result<Map<string, number>>> {
    if (groupKeys.length === 0) {
        return Ok(new Map());
    }
    try {
        const rows = await db.from<GroupOverride>(GROUP_OVERRIDES_TABLE).whereIn('group_key', groupKeys).select('group_key', 'max_concurrency');
        return Ok(new Map(rows.map((r) => [r.group_key, r.max_concurrency])));
    } catch (err) {
        return Err(new Error(`Error getting group overrides: ${stringifyError(err)}`));
    }
}
