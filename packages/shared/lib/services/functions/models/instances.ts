import { Err, Ok } from '@nangohq/utils';

import { CONFIGS_TABLE, INSTANCES_TABLE } from './tables.js';

import type { DBFunctionConfig, DBFunctionInstance } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export type FunctionInstanceUpsert = Pick<DBFunctionInstance, 'nango_connection_id' | 'function_config_id' | 'name' | 'variant' | 'frequency'>;
export type FunctionInstanceFilter = { functionConfigIds: number[] } | { connectionIds: number[] };
export type FunctionInstanceSearchOptions = { includeDeleted?: boolean; afterId?: number; limit?: number };

const UPSERT_BATCH_SIZE = 1000;
const SOFT_DELETE_BATCH_SIZE = 1000;

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
    const ids = 'functionConfigIds' in filter ? filter.functionConfigIds : filter.connectionIds;
    if (ids.length === 0) {
        return Ok([]);
    }

    try {
        const query = trx.from<DBFunctionInstance>(INSTANCES_TABLE).select('*').orderBy('id');
        if ('functionConfigIds' in filter) {
            query.whereIn('function_config_id', filter.functionConfigIds);
        } else {
            query.whereIn('nango_connection_id', filter.connectionIds);
        }
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
        const ids = 'functionConfigIds' in filter ? filter.functionConfigIds : filter.connectionIds;
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
                    .whereIn(
                        'function_config_id',
                        trx
                            .from<DBFunctionConfig>(CONFIGS_TABLE)
                            .select('id')
                            .where({ environment_id: environmentId })
                            .modify((builder) => {
                                if ('functionConfigIds' in filter) {
                                    builder.whereIn('id', batch);
                                }
                            })
                    )
                    .whereNull('deleted_at');
                if ('connectionIds' in filter) {
                    query.whereIn('nango_connection_id', batch);
                }
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
