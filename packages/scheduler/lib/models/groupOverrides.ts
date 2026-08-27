import { Err, Ok, stringifyError } from '@nangohq/utils';

import type { Result } from '@nangohq/utils';
import type knex from 'knex';

export const GROUP_OVERRIDES_TABLE = 'group_overrides';

export interface GroupOverride {
    group_key: string;
    max_concurrency: number | null;
    task_cap: number | null;
    rate_limit_per_min: number | null;
    created_at?: Date;
    updated_at?: Date;
}

export interface GroupOverrideValues {
    maxConcurrency: number | null;
    taskCap: number | null;
    rateLimitPerMin: number | null;
}

type UpsertParams = { groupKey: string } & (
    | { maxConcurrency: number | null; taskCap?: number | null; rateLimitPerMin?: number | null }
    | { maxConcurrency?: number | null; taskCap: number | null; rateLimitPerMin?: number | null }
    | { maxConcurrency?: number | null; taskCap?: number | null; rateLimitPerMin: number | null }
);

/**
 * Set one or more overrides for a group. Values omitted from an update are preserved, while null clears an override.
 * Max concurrency is stamped onto tasks when they are created, the task cap is evaluated on every admission,
 * and the rate limit replaces the global admission rate for the group.
 */
export async function upsert(db: knex.Knex, { groupKey, maxConcurrency, taskCap, rateLimitPerMin }: UpsertParams): Promise<Result<void>> {
    try {
        const update = {
            ...(maxConcurrency !== undefined ? { max_concurrency: maxConcurrency } : {}),
            ...(taskCap !== undefined ? { task_cap: taskCap } : {}),
            ...(rateLimitPerMin !== undefined ? { rate_limit_per_min: rateLimitPerMin } : {}),
            updated_at: new Date()
        };
        await db
            .from<GroupOverride>(GROUP_OVERRIDES_TABLE)
            .insert({
                group_key: groupKey,
                max_concurrency: maxConcurrency ?? null,
                task_cap: taskCap ?? null,
                rate_limit_per_min: rateLimitPerMin ?? null
            })
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
            .select<
                Pick<GroupOverride, 'group_key' | 'max_concurrency' | 'task_cap' | 'rate_limit_per_min'>[]
            >('group_key', 'max_concurrency', 'task_cap', 'rate_limit_per_min');
        return Ok(
            new Map(rows.map((row) => [row.group_key, { maxConcurrency: row.max_concurrency, taskCap: row.task_cap, rateLimitPerMin: row.rate_limit_per_min }]))
        );
    } catch (err) {
        return Err(new Error(`Error getting group overrides: ${stringifyError(err)}`));
    }
}

/**
 * Fetch every group that has a rate limit override. Callers cache this, so it is a full scan of a
 * table that only holds rows an operator created by hand.
 */
export async function getRateLimits(db: knex.Knex): Promise<Result<Map<string, number>>> {
    try {
        const rows = await db
            .from<GroupOverride>(GROUP_OVERRIDES_TABLE)
            .whereNotNull('rate_limit_per_min')
            .select<Pick<GroupOverride, 'group_key' | 'rate_limit_per_min'>[]>('group_key', 'rate_limit_per_min');
        return Ok(new Map(rows.map((row) => [row.group_key, row.rate_limit_per_min!])));
    } catch (err) {
        return Err(new Error(`Error getting group rate limit overrides: ${stringifyError(err)}`));
    }
}
