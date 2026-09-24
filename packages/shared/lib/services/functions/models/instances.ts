import { Err, Ok } from '@nangohq/utils';

import { CONFIGS_TABLE, INSTANCES_TABLE } from './tables.js';

import type { DBFunctionConfig, DBFunctionInstance } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export type FunctionInstanceUpsert = Pick<DBFunctionInstance, 'nango_connection_id' | 'function_config_id' | 'name' | 'variant' | 'frequency'>;
export type FunctionInstanceFilter = { functionConfigIds: number[] } | { connectionIds: number[] } | { instanceIds: number[] };
export type FunctionInstanceSearchOptions = { includeDeleted?: boolean; afterId?: number; limit?: number };

const UPSERT_BATCH_SIZE = 1000;
const SOFT_DELETE_BATCH_SIZE = 1000;

type FilterColumn = 'function_config_id' | 'nango_connection_id' | 'id';

function resolveFilter(filter: FunctionInstanceFilter): [field: FilterColumn, ids: number[]] {
    if ('functionConfigIds' in filter) {
        return ['function_config_id', filter.functionConfigIds];
    } else if ('connectionIds' in filter) {
        return ['nango_connection_id', filter.connectionIds];
    } else {
        return ['id', filter.instanceIds];
    }
}

export async function upsert(db: Knex, instances: FunctionInstanceUpsert[]): Promise<Result<DBFunctionInstance[]>> {
    if (instances.length === 0) {
        return Ok([]);
    }

    try {
        const results = await db.transaction(async (trx) => {
            const upsertedInstances: DBFunctionInstance[] = [];
            for (let offset = 0; offset < instances.length; offset += UPSERT_BATCH_SIZE) {
                const batch = instances.slice(offset, offset + UPSERT_BATCH_SIZE);
                const upserted = await trx
                    .from<DBFunctionInstance>(INSTANCES_TABLE)
                    .insert(
                        batch.map((i) => ({
                            nango_connection_id: i.nango_connection_id,
                            function_config_id: i.function_config_id,
                            name: i.name,
                            variant: i.variant,
                            frequency: i.frequency
                        }))
                    )
                    .onConflict(trx.raw('(nango_connection_id, function_config_id, variant) WHERE deleted_at IS NULL'))
                    // A deployment must not overwrite a connection-level frequency override.
                    .merge(['name'])
                    .returning<DBFunctionInstance[]>('*');

                if (!upserted || upserted.length !== batch.length) {
                    throw new Error('failed_to_upsert_function_instance');
                }
                upsertedInstances.push(...upserted);
            }
            return upsertedInstances;
        });
        return Ok(results);
    } catch (err) {
        return Err(new Error('failed_to_upsert_function_instance', { cause: err }));
    }
}

export async function search(
    trx: Knex,
    filter: FunctionInstanceFilter,
    { includeDeleted = false, afterId, limit }: FunctionInstanceSearchOptions = {}
): Promise<Result<DBFunctionInstance[]>> {
    const [field, ids] = resolveFilter(filter);
    if (ids.length === 0) {
        return Ok([]);
    }

    try {
        const query = trx.from<DBFunctionInstance>(INSTANCES_TABLE).select('*').orderBy('id');
        query.whereIn(field, ids);
        if (!includeDeleted) {
            query.whereNull('deleted_at');
        }
        if (afterId !== undefined) {
            query.where('id', '>', afterId);
        }
        if (limit !== undefined) {
            query.limit(limit);
        }
        return Ok(await query);
    } catch (err) {
        return Err(new Error('failed_to_search_function_instances', { cause: err }));
    }
}

export async function softDelete(
    db: Knex,
    filter: FunctionInstanceFilter,
    { environmentId }: { environmentId: number }
): Promise<Result<DBFunctionInstance[]>> {
    try {
        const [field, ids] = resolveFilter(filter);
        if (ids.length === 0) {
            return Ok([]);
        }
        const deleted = await db.transaction(async (trx) => {
            const now = trx.fn.now();
            const deletedInstances: DBFunctionInstance[] = [];
            for (let offset = 0; offset < ids.length; offset += SOFT_DELETE_BATCH_SIZE) {
                const batch = ids.slice(offset, offset + SOFT_DELETE_BATCH_SIZE);
                const query = trx
                    .from<DBFunctionInstance>(INSTANCES_TABLE)
                    .whereIn('function_config_id', trx.from<DBFunctionConfig>(CONFIGS_TABLE).select('id').where({ environment_id: environmentId }))
                    .whereIn(field, batch)
                    .whereNull('deleted_at');
                const rows = await query.update({ deleted_at: now, updated_at: now }).returning('*');
                for (const row of rows) {
                    deletedInstances.push(row);
                }
            }
            return deletedInstances;
        });

        return Ok(deleted);
    } catch (err) {
        return Err(new Error('failed_to_soft_delete_function_instances', { cause: err }));
    }
}

export async function hardDelete(
    db: Knex,
    filter: FunctionInstanceFilter,
    { environmentId }: { environmentId: number }
): Promise<Result<DBFunctionInstance[]>> {
    try {
        const [field, ids] = resolveFilter(filter);
        if (ids.length === 0) {
            return Ok([]);
        }

        const deleted = await db
            .from<DBFunctionInstance>(INSTANCES_TABLE)
            .whereIn('function_config_id', db.from<DBFunctionConfig>(CONFIGS_TABLE).select('id').where({ environment_id: environmentId }))
            .whereIn(field, ids)
            .delete()
            .returning('*');
        return Ok(deleted);
    } catch (err) {
        return Err(new Error('failed_to_hard_delete_function_instances', { cause: err }));
    }
}
