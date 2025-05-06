import type knex from 'knex';
import { Err, Ok, stringifyError } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { Group } from '../types.js';

export const GROUPS_TABLE = 'groups';

export interface DbGroup {
    readonly key: string;
    readonly max_concurrency: number;
    readonly created_at: Date;
    updated_at: Date;
    last_task_added_at: Date | null;
    deleted_at: Date | null;
}

export const DbGroup = {
    to: (group: Group): DbGroup => ({
        key: group.key,
        max_concurrency: group.maxConcurrency,
        created_at: group.createdAt,
        updated_at: group.updatedAt,
        last_task_added_at: group.lastTaskAddedAt,
        deleted_at: group.deletedAt
    }),
    from: (dbGroup: DbGroup): Group => ({
        key: dbGroup.key,
        maxConcurrency: dbGroup.max_concurrency,
        createdAt: dbGroup.created_at,
        updatedAt: dbGroup.updated_at,
        lastTaskAddedAt: dbGroup.last_task_added_at,
        deletedAt: dbGroup.deleted_at
    })
};

export async function upsert(db: knex.Knex, group: Omit<Group, 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<Result<Group>> {
    const now = new Date();
    try {
        const toInsert: DbGroup = {
            key: group.key,
            max_concurrency: group.maxConcurrency,
            created_at: now,
            updated_at: now,
            last_task_added_at: group.lastTaskAddedAt,
            deleted_at: null
        };
        const [dbGroup] = await db
            .from<DbGroup>(GROUPS_TABLE)
            .insert(toInsert)
            .onConflict('key')
            .merge({
                max_concurrency: group.maxConcurrency,
                last_task_added_at: group.lastTaskAddedAt,
                deleted_at: null
            })
            .returning('*');
        if (!dbGroup) {
            return Err(new Error(`Failed to upsert group '${group.key}'`));
        }
        return Ok(DbGroup.from(dbGroup));
    } catch (err) {
        return Err(new Error(`Error upserting group '${group.key}': ${stringifyError(err)}`));
    }
}

export async function hardDeleteUnused(db: knex.Knex, props: { ms: number }): Promise<Result<Group[]>> {
    try {
        const deleted = await db
            .from<Group>(GROUPS_TABLE)
            .where(
                'key',
                '=',
                db.raw(`ANY(ARRAY(
                    SELECT "key"
                    FROM ${GROUPS_TABLE}
                    WHERE (
                        "last_task_added_at" < NOW() - INTERVAL '${props.ms} milliseconds'
                        OR (
                            "last_task_added_at" IS NULL
                            AND "updated_at" < NOW() - INTERVAL '${props.ms} milliseconds'
                        )
                    )
                    LIMIT 100
                  ))`)
            )
            .del()
            .returning('*');
        return Ok(deleted);
    } catch (err) {
        return Err(new Error(`Error hard deleting group unused in ${props.ms} ms: ${stringifyError(err)}`));
    }
}
