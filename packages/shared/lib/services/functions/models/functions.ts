import { Err, Ok } from '@nangohq/utils';

import type { DBFunctionConfig, DBFunctionConfigVersion, DBIntegrationDecrypted } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

const CONFIGS_TABLE = 'function_configs';
const VERSIONS_TABLE = 'function_config_versions';
const INTEGRATIONS_TABLE = '_nango_configs';

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

type FunctionIntegration = Pick<DBIntegrationDecrypted, 'id' | 'unique_key'> & { id: number };

const INTEGRATION_COLUMNS = {
    id: true,
    unique_key: true
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

type Prefixed<T, Prefix extends string> = {
    [K in keyof T as `${Prefix}${Extract<K, string>}`]: T[K];
};

type JoinedFunctionConfigRow = Prefixed<DBFunctionConfig, typeof CONFIG_PREFIX> &
    Prefixed<DBFunctionConfigVersion, typeof VERSION_PREFIX> &
    Prefixed<FunctionIntegration, typeof INTEGRATION_PREFIX>;

export async function search(
    trx: Knex,
    { environmentId, integrationKey }: { environmentId: number; integrationKey?: string | undefined }
): Promise<Result<CurrentFunctionConfig[]>> {
    try {
        const query = trx
            .from({ config: CONFIGS_TABLE })
            .join({ integration: INTEGRATIONS_TABLE }, function () {
                this.on('integration.id', 'config.nango_config_id').andOn('integration.environment_id', 'config.environment_id');
            })
            .leftJoin({ version: VERSIONS_TABLE }, 'version.id', 'config.current_version_id')
            .select<JoinedFunctionConfigRow[]>([
                ...aliasedColumns<FunctionIntegration>('integration', INTEGRATION_COLUMNS, INTEGRATION_PREFIX),
                ...aliasedColumns<DBFunctionConfig>('config', CONFIG_COLUMNS, CONFIG_PREFIX),
                ...aliasedColumns<DBFunctionConfigVersion>('version', VERSION_COLUMNS, VERSION_PREFIX)
            ])
            .where('config.environment_id', environmentId)
            .where('integration.deleted', false)
            .whereNull('config.deleted_at')
            .whereNull('version.deleted_at');

        if (integrationKey) {
            query.where('integration.unique_key', integrationKey);
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

export async function upsert(
    db: Knex,
    {
        environmentId,
        integrationId,
        name,
        version
    }: {
        environmentId: number;
        integrationId: string;
        name: string;
        version: Omit<DBFunctionConfigVersion, 'id' | 'function_config_id' | 'created_at' | 'updated_at' | 'deleted_at'>;
    }
): Promise<Result<CurrentFunctionConfig>> {
    try {
        const upserted = await db.transaction(async (trx) => {
            // insert and returns new function config or return the existing one
            const [config] = await trx(CONFIGS_TABLE)
                .insert({
                    environment_id: environmentId,
                    nango_config_id: trx
                        .from<DBIntegrationDecrypted>(INTEGRATIONS_TABLE)
                        .select('id')
                        .where({ environment_id: environmentId, unique_key: integrationId, deleted: false }),
                    name
                })
                .onConflict(trx.raw('(nango_config_id, name) WHERE deleted_at IS NULL'))
                .merge(['nango_config_id'])
                .returning<DBFunctionConfig[]>('*');

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

            return {
                integration: { id: config.nango_config_id, unique_key: integrationId },
                config: updatedConfig ?? config,
                currentVersion
            };
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
        const now = new Date();
        const deleted = await trx
            .from<DBFunctionConfig>(CONFIGS_TABLE)
            .where({ environment_id: environmentId })
            .whereIn('id', ids)
            .whereNull('deleted_at')
            .update({ deleted_at: now, updated_at: now });
        return Ok(deleted);
    } catch (err) {
        return Err(new Error('failed_to_soft_delete_functions', { cause: err }));
    }
}
