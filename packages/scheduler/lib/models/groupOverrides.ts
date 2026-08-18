import { Err, Ok, stringifyError } from '@nangohq/utils';

import type { Result } from '@nangohq/utils';
import type knex from 'knex';

export const GROUP_OVERRIDES_TABLE = 'group_overrides';

export interface GroupOverride {
    group_key: string;
    max_concurrency: number | null;
    task_cap: number | null;
    created_at?: Date;
    updated_at?: Date;
}

export interface GroupOverrideValues {
    maxConcurrency: number | null;
    taskCap: number | null;
}

type UpsertParams = { groupKey: string } & ({ maxConcurrency: number; taskCap?: number } | { maxConcurrency?: number; taskCap: number });

/**
 * Set one or more overrides for a group. Values omitted from an update are preserved.
 * Max concurrency is stamped onto tasks when they are created, while the task cap is evaluated on every admission.
 */
export async function upsert(db: knex.Knex, { groupKey, maxConcurrency, taskCap }: UpsertParams): Promise<Result<void>> {
    try {
        const update = {
            ...(maxConcurrency !== undefined ? { max_concurrency: maxConcurrency } : {}),
            ...(taskCap !== undefined ? { task_cap: taskCap } : {}),
            updated_at: new Date()
        };
        await db
            .from<GroupOverride>(GROUP_OVERRIDES_TABLE)
            .insert({ group_key: groupKey, max_concurrency: maxConcurrency ?? null, task_cap: taskCap ?? null })
            .onConflict('group_key')
            .merge(update);
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
export async function getByGroupKeys(db: knex.Knex, groupKeys: string[]): Promise<Result<Map<string, GroupOverrideValues>>> {
    if (groupKeys.length === 0) {
        return Ok(new Map());
    }
    try {
        const rows = await db
            .from<GroupOverride>(GROUP_OVERRIDES_TABLE)
            .whereIn('group_key', groupKeys)
            .select<Pick<GroupOverride, 'group_key' | 'max_concurrency' | 'task_cap'>[]>('group_key', 'max_concurrency', 'task_cap');
        return Ok(new Map(rows.map((row) => [row.group_key, { maxConcurrency: row.max_concurrency, taskCap: row.task_cap }])));
    } catch (err) {
        return Err(new Error(`Error getting group overrides: ${stringifyError(err)}`));
    }
}
