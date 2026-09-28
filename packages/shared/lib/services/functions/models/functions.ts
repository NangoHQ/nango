import { Err, Ok } from '@nangohq/utils';

import { CONFIGS_TABLE, INTEGRATIONS_TABLE, VERSIONS_TABLE } from './tables.js';

import type { DBFunctionConfig, DBFunctionConfigVersion, DBIntegrationDecrypted, OnEventType } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

const CONFIG_COLUMNS = {
    id: true,
    nango_config_id: true,
    environment_id: true,
    name: true,
    current_version_id: true,
    enabled: true,
    created_at: true,
    updated_at: true,
    deleted_at: true
} satisfies Record<keyof DBFunctionConfig, true>;

const VERSION_COLUMNS = {
    id: true,
    function_config_id: true,
    description: true,
    file_location: true,
    version: true,
    source: true,
    trigger: true,
    requires: true,
    capabilities: true,
    limits: true,
    input_schema_ref: true,
    output_schema_ref: true,
    model_schema_refs: true,
    metadata_schema_ref: true,
    checkpoint_schema_ref: true,
    json_schema: true,
    created_at: true,
    updated_at: true,
    deleted_at: true
} satisfies Record<keyof DBFunctionConfigVersion, true>;

type FunctionIntegration = Pick<DBIntegrationDecrypted, 'id' | 'unique_key' | 'provider'> & { id: number };

const INTEGRATION_COLUMNS = {
    id: true,
    unique_key: true,
    provider: true
} satisfies Record<keyof FunctionIntegration, true>;

const CONFIG_PREFIX = 'config_';
const VERSION_PREFIX = 'version_';
const INTEGRATION_PREFIX = 'integration_';

function aliasedColumns<T extends object>(table: string, columns: Record<keyof T, true>, prefix: string): string[] {
    return Object.keys(columns).map((column) => `${table}.${column} as ${prefix}${column}`);
}

function stripPrefix<T>(row: Record<string, unknown>, prefix: string): T {
    const stripped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        if (key.startsWith(prefix)) {
            stripped[key.slice(prefix.length)] = value;
        }
    }
    // Sound because the column maps are exhaustive over the row types.
    return stripped as T;
}

export interface CurrentFunctionConfig {
    integration: FunctionIntegration;
    config: DBFunctionConfig;
    currentVersion: DBFunctionConfigVersion;
}

export async function rows(
    trx: Knex,
    { environmentId, integrationId }: { environmentId: number; integrationId: number },
    { includeDeleted = false, limit }: { includeDeleted?: boolean; limit?: number } = {}
): Promise<Result<DBFunctionConfig[]>> {
    try {
        const query = trx
            .from<DBFunctionConfig>(CONFIGS_TABLE)
            .select('*')
            .where({ environment_id: environmentId, nango_config_id: integrationId })
            .orderBy('id');
        if (!includeDeleted) {
            query.whereNull('deleted_at');
        }
        if (limit !== undefined) {
            query.limit(limit);
        }
        const configs = await query;
        return Ok(configs);
    } catch (err) {
        return Err(new Error('failed_to_find_function_configs', { cause: err }));
    }
}

export async function getSoftDeleted(trx: Knex, { olderThanDays, limit }: { olderThanDays: number; limit: number }): Promise<Result<DBFunctionConfig[]>> {
    try {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - olderThanDays);
        const configs = await trx
            .from<DBFunctionConfig>(CONFIGS_TABLE)
            .select('*')
            .whereNotNull('deleted_at')
            .andWhere('deleted_at', '<=', threshold.toISOString())
            .orderBy('deleted_at')
            .orderBy('id')
            .limit(limit);
        return Ok(configs);
    } catch (err) {
        return Err(new Error('failed_to_find_soft_deleted_function_configs', { cause: err }));
    }
}

// Gathers the `file_location` of every version of a function config, skipping local files.
export async function getArtifactFileLocations(trx: Knex, { environmentId, id }: { environmentId: number; id: number }): Promise<Result<string[]>> {
    try {
        const versions = await trx
            .from<DBFunctionConfigVersion>({ version: VERSIONS_TABLE })
            .join<DBFunctionConfig>({ config: CONFIGS_TABLE }, 'config.id', 'version.function_config_id')
            .select<Pick<DBFunctionConfigVersion, 'file_location'>[]>('version.file_location')
            .where('config.id', id)
            .where('config.environment_id', environmentId)
            .orderBy('version.id');

        return Ok([...new Set(versions.map(({ file_location }) => file_location).filter((location) => location !== '_LOCAL_FILE_'))]);
    } catch (err) {
        return Err(new Error('failed_to_find_function_artifacts', { cause: err }));
    }
}

/**
 * Turns `file_location`s into the artifact keys that are safe to delete.
 * Artifacts still referenced by a live config are excluded.
 */
export async function safeToDeleteArtifacts(
    trx: Knex,
    { environmentId, fileLocations }: { environmentId: number; fileLocations: string[] }
): Promise<Result<string[]>> {
    try {
        if (fileLocations.length === 0) {
            return Ok([]);
        }

        const referencedByLiveConfig = await trx
            .from<DBFunctionConfigVersion>({ version: VERSIONS_TABLE })
            .join<DBFunctionConfig>({ config: CONFIGS_TABLE }, 'config.id', 'version.function_config_id')
            .select<Pick<DBFunctionConfigVersion, 'file_location'>[]>('version.file_location')
            .where('config.environment_id', environmentId)
            .whereNull('config.deleted_at')
            .whereIn('version.file_location', fileLocations);
        const retained = new Set(referencedByLiveConfig.map(({ file_location }) => file_location));

        return Ok(
            fileLocations
                .filter((location) => !retained.has(location) && location.endsWith('.js'))
                .flatMap((location) => [location, `${location.slice(0, -3)}.ts`])
        );
    } catch (err) {
        return Err(new Error('failed_safe_to_delete_artifacts', { cause: err }));
    }
}

type Prefixed<T, Prefix extends string> = {
    [K in keyof T as `${Prefix}${Extract<K, string>}`]: T[K];
};

type SearchFunctionConfigRow = Prefixed<DBFunctionConfig, typeof CONFIG_PREFIX> &
    Prefixed<DBFunctionConfigVersion, typeof VERSION_PREFIX> &
    Prefixed<FunctionIntegration, typeof INTEGRATION_PREFIX>;

interface FunctionSearchFilter {
    integrationKey: string;
    id?: number | undefined;
    name?: string | undefined;
    enabled?: boolean | undefined;
    trigger?: { kind: 'http'; hasSubscriptions: boolean } | { kind: 'event'; event: OnEventType } | undefined;
}

export async function search(
    trx: Knex,
    {
        environmentId,
        filter
    }: {
        environmentId: number;
        filter?: FunctionSearchFilter | undefined;
    }
): Promise<Result<CurrentFunctionConfig[]>> {
    try {
        const query = trx
            .from({ config: CONFIGS_TABLE })
            .join({ integration: INTEGRATIONS_TABLE }, function () {
                this.on('integration.id', 'config.nango_config_id').andOn('integration.environment_id', 'config.environment_id');
            })
            .leftJoin({ version: VERSIONS_TABLE }, 'version.id', 'config.current_version_id')
            .select<SearchFunctionConfigRow[]>([
                ...aliasedColumns<FunctionIntegration>('integration', INTEGRATION_COLUMNS, INTEGRATION_PREFIX),
                ...aliasedColumns<DBFunctionConfig>('config', CONFIG_COLUMNS, CONFIG_PREFIX),
                ...aliasedColumns<DBFunctionConfigVersion>('version', VERSION_COLUMNS, VERSION_PREFIX)
            ])
            .where('config.environment_id', environmentId)
            .where('integration.deleted', false)
            .whereNull('config.deleted_at')
            .whereNull('version.deleted_at');

        if (filter) {
            query.where('integration.unique_key', filter.integrationKey);
        }
        if (filter?.name !== undefined) {
            query.where('config.name', filter.name);
        }
        if (filter?.id !== undefined) {
            query.where('config.id', filter.id);
        }
        if (filter?.enabled !== undefined) {
            query.where('config.enabled', filter.enabled);
        }
        if (filter?.trigger) {
            switch (filter.trigger.kind) {
                case 'http': {
                    query.whereRaw("version.trigger->>'kind' = 'http'");
                    const subscriptionCount = `CASE
                        WHEN jsonb_typeof(version.trigger->'subscriptions') = 'array'
                        THEN jsonb_array_length(version.trigger->'subscriptions')
                        ELSE 0
                    END`;
                    query.whereRaw(`${subscriptionCount} ${filter.trigger.hasSubscriptions ? '>' : '='} 0`);
                    break;
                }
                case 'event':
                    query.whereRaw("version.trigger->>'kind' = 'event'");
                    query.whereRaw("version.trigger->'events' @> ?::jsonb", [JSON.stringify([filter.trigger.event])]);
                    break;
            }
        }

        const rows = await query;

        const current: CurrentFunctionConfig[] = [];
        for (const row of rows) {
            const integration = stripPrefix<FunctionIntegration>(row, INTEGRATION_PREFIX);
            const config = stripPrefix<DBFunctionConfig>(row, CONFIG_PREFIX);
            const currentVersion = row.version_id === null ? undefined : stripPrefix<DBFunctionConfigVersion>(row, VERSION_PREFIX);
            if (!currentVersion) {
                return Err(new Error('function_config_missing_current_version', { cause: { configId: config.id, name: config.name } }));
            }
            current.push({ integration, config, currentVersion });
        }

        return Ok(current);
    } catch (err) {
        return Err(new Error('failed_to_find_function', { cause: err }));
    }
}

export interface FunctionConfigUpsert {
    environmentId: number;
    integrationId: string;
    name: string;
    version: Omit<DBFunctionConfigVersion, 'id' | 'function_config_id' | 'created_at' | 'updated_at' | 'deleted_at'>;
}

export async function upsert(db: Knex, inputs: FunctionConfigUpsert[]): Promise<Result<CurrentFunctionConfig[]>> {
    try {
        const upserted = await db.transaction(async (trx) => {
            const results: CurrentFunctionConfig[] = [];
            for (const { environmentId, integrationId, name, version } of inputs) {
                // insert and returns new function config or return the existing one
                const [config] = await trx
                    .with('integration', (qb) =>
                        qb
                            .from<DBIntegrationDecrypted>(INTEGRATIONS_TABLE)
                            .select('id', 'provider')
                            .where({ environment_id: environmentId, unique_key: integrationId, deleted: false })
                    )
                    .with(
                        'upserted',
                        trx.raw(
                            `INSERT INTO ?? (environment_id, nango_config_id, name)
                             SELECT ?, integration.id, ? FROM integration
                             ON CONFLICT (nango_config_id, name) WHERE deleted_at IS NULL
                             DO UPDATE SET nango_config_id = EXCLUDED.nango_config_id
                             RETURNING *`,
                            [CONFIGS_TABLE, environmentId, name]
                        )
                    )
                    .select<(DBFunctionConfig & { provider: string })[]>('upserted.*', 'integration.provider')
                    .from('upserted')
                    .join('integration', 'integration.id', 'upserted.nango_config_id');

                if (!config) {
                    throw new Error('failed_to_upsert_function_config', { cause: { integrationId } });
                }

                // insert and returns new function config version or return the existing one
                const [currentVersion] = await trx
                    .from<DBFunctionConfigVersion>(VERSIONS_TABLE)
                    .insert({ ...version, function_config_id: config.id })
                    .onConflict(trx.raw('(function_config_id, version) WHERE deleted_at IS NULL'))
                    .merge(['function_config_id'])
                    .returning<DBFunctionConfigVersion[]>('*');

                if (!currentVersion) {
                    throw new Error('failed_to_upsert_function_config_version');
                }

                // update the function config to point to the current version if it doesn't already
                const [updatedConfig] = await trx
                    .from<DBFunctionConfig>(CONFIGS_TABLE)
                    .where({ id: config.id })
                    .whereRaw('current_version_id IS DISTINCT FROM ?', [currentVersion.id])
                    .update({ current_version_id: currentVersion.id, updated_at: new Date() })
                    .returning<DBFunctionConfig[]>('*');

                results.push({
                    integration: { id: config.nango_config_id, unique_key: integrationId, provider: config.provider },
                    config: updatedConfig ?? config,
                    currentVersion
                });
            }
            return results;
        });

        return Ok(upserted);
    } catch (err) {
        return Err(new Error('failed_to_upsert_function', { cause: err }));
    }
}

export async function softDelete(trx: Knex, { environmentId, ids }: { environmentId: number; ids: number[] }): Promise<Result<number>> {
    try {
        if (ids.length === 0) {
            return Ok(0);
        }
        const now = trx.fn.now();
        const deleted = await trx
            .from<DBFunctionConfig>(CONFIGS_TABLE)
            .where({ environment_id: environmentId })
            .whereIn('id', ids)
            .whereNull('deleted_at')
            .update({ deleted_at: now, updated_at: now });

        await trx
            .from(VERSIONS_TABLE)
            .whereIn('function_config_id', trx.from(CONFIGS_TABLE).select('id').where({ environment_id: environmentId }).whereIn('id', ids))
            .whereNull('deleted_at')
            .update({ deleted_at: now, updated_at: now });

        return Ok(deleted);
    } catch (err) {
        return Err(new Error('failed_to_soft_delete_functions', { cause: err }));
    }
}

export async function hardDelete(trx: Knex, { environmentId, ids }: { environmentId: number; ids: number[] }): Promise<Result<number>> {
    try {
        if (ids.length === 0) {
            return Ok(0);
        }
        const deleted = await trx.from<DBFunctionConfig>(CONFIGS_TABLE).where({ environment_id: environmentId }).whereIn('id', ids).delete();
        return Ok(deleted);
    } catch (err) {
        return Err(new Error('failed_to_hard_delete_functions', { cause: err }));
    }
}
