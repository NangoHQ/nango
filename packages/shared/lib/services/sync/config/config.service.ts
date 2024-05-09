import semver from 'semver';
import db, { schema, dbNamespace } from '../../../db/database.js';
import { getLogger } from '@nangohq/utils';
import configService from '../../config.service.js';
import remoteFileService from '../../file/remote.service.js';
import { LogActionEnum } from '../../../models/Activity.js';
import type { Action, SyncConfigWithProvider, SyncType, SyncConfig, SlimSync, NangoConfigMetadata } from '../../../models/Sync.js';
import { SyncConfigType } from '../../../models/Sync.js';
import { convertV2ConfigObject } from '../../nango-config.service.js';
import type { NangoConnection } from '../../../models/Connection.js';
import type { Config as ProviderConfig } from '../../../models/Provider.js';
import type {
    NangoModelV1,
    NangoSyncModelField,
    NangoSyncModel,
    NangoConfig,
    NangoConfigV1,
    NangoV2Integration,
    StandardNangoConfig,
    NangoIntegrationDataV2
} from '../../../models/NangoConfig.js';
import errorManager, { ErrorSourceEnum } from '../../../utils/error.manager.js';

const logger = getLogger('Sync.Config');

const TABLE = dbNamespace + 'sync_configs';

type extendedSyncConfig = SyncConfig & { provider: string; unique_key: string; endpoints_object: { method: string; path: string }[] };

const convertSyncConfigToStandardConfig = (syncConfigs: extendedSyncConfig[]): StandardNangoConfig[] => {
    const nangoConfig = {
        integrations: {} as Record<string, NangoV2Integration>,
        models: {}
    };

    let isV1 = false;

    for (const syncConfig of syncConfigs) {
        if (!syncConfig) {
            continue;
        }

        const uniqueKey = syncConfig.unique_key;

        if (!uniqueKey) {
            continue;
        }

        if (!nangoConfig['integrations'][uniqueKey]) {
            nangoConfig['integrations'][uniqueKey] = {
                provider: syncConfig.provider
            } as NangoV2Integration;
        }

        const syncName = syncConfig.sync_name;

        const endpoint =
            !syncConfig.endpoints_object || syncConfig?.endpoints_object?.length === 0
                ? null
                : syncConfig.endpoints_object.map((endpoint) => `${endpoint.method} ${endpoint.path}`);

        if (!endpoint || endpoint.length === 0) {
            isV1 = true;
        }

        const flowObject = {
            id: syncConfig.id,
            runs: syncConfig.runs,
            type: syncConfig.type,
            output: syncConfig.models,
            returns: syncConfig.models,
            description: syncConfig?.metadata?.description || '',
            track_deletes: syncConfig.track_deletes,
            auto_start: syncConfig.auto_start,
            attributes: syncConfig.attributes || {},
            scopes: syncConfig?.metadata?.scopes || [],
            version: syncConfig.version as string,
            updated_at: syncConfig.updated_at?.toISOString(),
            is_public: syncConfig?.is_public,
            pre_built: syncConfig?.pre_built,
            endpoint:
                !syncConfig.endpoints_object || syncConfig?.endpoints_object?.length === 0
                    ? null
                    : syncConfig.endpoints_object.map((endpoint) => `${endpoint.method} ${endpoint.path}`),
            input: syncConfig.input,
            'webhook-subscriptions': syncConfig.webhook_subscriptions,
            nango_yaml_version: isV1 ? 'v1' : 'v2',
            enabled: syncConfig.enabled
        } as NangoIntegrationDataV2;

        if (syncConfig.type === SyncConfigType.SYNC) {
            if (!nangoConfig['integrations'][uniqueKey]!['syncs']) {
                nangoConfig['integrations'][uniqueKey]!['syncs'] = {} as Record<string, NangoIntegrationDataV2>;
            }
            flowObject['sync_type'] = syncConfig.sync_type as SyncType;
            nangoConfig['integrations'][uniqueKey]!['syncs'] = {
                ...nangoConfig['integrations'][uniqueKey]!['syncs'],
                [syncName]: flowObject
            };
        } else {
            if (!nangoConfig['integrations'][uniqueKey]!['actions']) {
                nangoConfig['integrations'][uniqueKey]!['actions'] = {} as Record<string, NangoIntegrationDataV2>;
            }
            nangoConfig['integrations'][uniqueKey]!['actions'] = {
                ...nangoConfig['integrations'][uniqueKey]!['actions'],
                [syncName]: flowObject
            };
        }
    }

    const { success, error, response: standardConfig } = convertV2ConfigObject(nangoConfig);

    if (error) {
        logger.error(`Error in converting sync config to standard config: ${error}`);
    }

    if (!success || !standardConfig) {
        return [];
    }

    const configWithModels = standardConfig.map((config: StandardNangoConfig) => {
        const { providerConfigKey } = config;
        for (const sync of [...config.syncs, ...config.actions]) {
            const { name } = sync;
            const syncObject = syncConfigs.find(
                (syncConfig: extendedSyncConfig) => syncConfig.sync_name === name && syncConfig.unique_key === providerConfigKey
            );

            const { model_schema, input } = syncObject as SyncConfig;

            for (const model of model_schema) {
                if (Array.isArray(model.fields) && Array.isArray(model.fields[0])) {
                    model.fields = model.fields.flat();
                }

                if (model.name === input) {
                    sync.input = model;
                }
            }
            sync.models = model_schema;
        }

        return config;
    });

    return configWithModels;
};

export async function getSyncConfig(nangoConnection: NangoConnection, syncName?: string, isAction?: boolean): Promise<NangoConfig | null> {
    let syncConfigs;

    if (!syncName) {
        syncConfigs = await getSyncConfigsByParams(nangoConnection.environment_id, nangoConnection.provider_config_key, isAction);

        if (!syncConfigs || syncConfigs.length === 0) {
            return null;
        }
    } else {
        syncConfigs = await getSyncConfigByParams(nangoConnection.environment_id, syncName, nangoConnection.provider_config_key, isAction);
        if (!syncConfigs) {
            return null;
        }

        // this is an array because sometimes we don't know the sync name, but regardless
        // we want to iterate over the sync configs
        syncConfigs = [syncConfigs];
    }

    const nangoConfig: NangoConfigV1 = {
        integrations: {
            [nangoConnection.provider_config_key]: {}
        },
        models: {}
    };

    for (const syncConfig of syncConfigs) {
        if (nangoConnection.provider_config_key !== undefined) {
            const key = nangoConnection.provider_config_key;

            const providerConfig = nangoConfig.integrations[key] ?? {};
            const configSyncName = syncConfig.sync_name;
            const fileLocation = syncConfig.file_location;

            providerConfig[configSyncName] = {
                sync_config_id: syncConfig.id as number,
                runs: syncConfig.runs,
                type: syncConfig.type,
                returns: syncConfig.models,
                input: syncConfig.input as string,
                track_deletes: syncConfig.track_deletes,
                auto_start: syncConfig.auto_start,
                attributes: syncConfig.attributes || {},
                fileLocation,
                version: syncConfig.version as string,
                pre_built: syncConfig.pre_built as boolean,
                is_public: syncConfig.is_public as boolean,
                metadata: syncConfig.metadata as NangoConfigMetadata,
                enabled: syncConfig.enabled
            };

            nangoConfig.integrations[key] = providerConfig;

            const models: NangoModelV1 = {};

            syncConfig.model_schema.forEach((model: NangoSyncModel) => {
                if (!models[model.name]) {
                    models[model.name] = {};
                }
                model.fields.forEach((field: NangoSyncModelField) => {
                    models[model.name]![field.name] = field.type;
                });
            });

            nangoConfig.models = models;
        }
    }

    return nangoConfig;
}

export async function getAllSyncsAndActions(environment_id: number): Promise<StandardNangoConfig[]> {
    const syncConfigs = await schema()
        .select(
            `${TABLE}.sync_name`,
            `${TABLE}.runs`,
            `${TABLE}.type`,
            `${TABLE}.models`,
            `${TABLE}.model_schema`,
            `${TABLE}.track_deletes`,
            `${TABLE}.auto_start`,
            `${TABLE}.attributes`,
            `${TABLE}.updated_at`,
            `${TABLE}.version`,
            `${TABLE}.sync_type`,
            `${TABLE}.metadata`,
            `${TABLE}.input`,
            `${TABLE}.enabled`,
            '_nango_configs.provider',
            '_nango_configs.unique_key',
            db.knex.raw(
                `(
                    SELECT json_agg(json_build_object('method', method, 'path', path))
                    FROM _nango_sync_endpoints
                    WHERE _nango_sync_endpoints.sync_config_id = ${TABLE}.id
                ) as endpoints_object`
            )
        )
        .from<SyncConfig>(TABLE)
        .join('_nango_configs', `${TABLE}.nango_config_id`, '_nango_configs.id')
        .where({
            [`${TABLE}.environment_id`]: environment_id,
            [`${TABLE}.deleted`]: false,
            active: true
        });

    if (!syncConfigs) {
        return [];
    }

    const standardConfig = convertSyncConfigToStandardConfig(syncConfigs);

    return standardConfig;
}

export async function getSyncConfigsByParams(environment_id: number, providerConfigKey: string, isAction?: boolean): Promise<SyncConfig[] | null> {
    const config = await configService.getProviderConfig(providerConfigKey, environment_id);

    if (!config) {
        throw new Error('Provider config not found');
    }

    return getSyncConfigsByConfigId(environment_id, config.id as number, isAction);
}

export async function getSyncConfigsByConfigId(environment_id: number, nango_config_id: number, isAction = false): Promise<SyncConfig[] | null> {
    const result = await schema()
        .from<SyncConfig>(TABLE)
        .where({
            environment_id,
            nango_config_id,
            active: true,
            enabled: true,
            type: isAction ? SyncConfigType.ACTION : SyncConfigType.SYNC,
            deleted: false
        });

    if (result) {
        return result;
    }

    return null;
}

export async function getFlowConfigsByParams(environment_id: number, providerConfigKey: string): Promise<SyncConfig[]> {
    const config = await configService.getProviderConfig(providerConfigKey, environment_id);

    if (!config) {
        throw new Error('Provider config not found');
    }

    const result = await schema()
        .from<SyncConfig>(TABLE)
        .where({
            environment_id,
            nango_config_id: config.id as number,
            active: true,
            deleted: false
        });

    if (result) {
        return result;
    }

    return [];
}

export async function getSyncAndActionConfigsBySyncNameAndConfigId(environment_id: number, nango_config_id: number, sync_name: string): Promise<SyncConfig[]> {
    try {
        const result = await schema().from<SyncConfig>(TABLE).where({
            environment_id,
            nango_config_id,
            sync_name,
            active: true,
            deleted: false
        });

        if (result) {
            return result;
        }
    } catch (error) {
        errorManager.report(error, {
            environmentId: environment_id,
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.DATABASE,
            metadata: {
                environment_id,
                nango_config_id,
                sync_name
            }
        });
    }
    return [];
}

export async function getActionConfigByNameAndProviderConfigKey(environment_id: number, name: string, unique_key: string): Promise<boolean> {
    const nango_config_id = await configService.getIdByProviderConfigKey(environment_id, unique_key);

    if (!nango_config_id) {
        return false;
    }

    const result = await schema()
        .from<SyncConfig>(TABLE)
        .where({
            environment_id,
            nango_config_id,
            sync_name: name,
            deleted: false,
            active: true,
            type: SyncConfigType.ACTION
        })
        .first();

    if (result) {
        return true;
    }

    return false;
}

export async function getActionsByProviderConfigKey(environment_id: number, unique_key: string): Promise<Action[]> {
    const nango_config_id = await configService.getIdByProviderConfigKey(environment_id, unique_key);

    if (!nango_config_id) {
        return [];
    }

    const result = await schema().from<SyncConfig>(TABLE).select('sync_name as name', 'created_at', 'updated_at').where({
        environment_id,
        nango_config_id,
        deleted: false,
        active: true,
        type: SyncConfigType.ACTION
    });

    if (result) {
        return result;
    }

    return [];
}

export async function getUniqueSyncsByProviderConfig(environment_id: number, unique_key: string): Promise<SyncConfig[]> {
    const nango_config_id = await configService.getIdByProviderConfigKey(environment_id, unique_key);

    if (!nango_config_id) {
        return [];
    }

    const result = await schema().from<SyncConfig>(TABLE).select('sync_name as name', 'created_at', 'updated_at', 'metadata').where({
        environment_id,
        nango_config_id,
        deleted: false,
        active: true,
        type: SyncConfigType.SYNC
    });

    if (result) {
        return result;
    }

    return [];
}

export async function getSyncAndActionConfigByParams(environment_id: number, sync_name: string, providerConfigKey: string): Promise<SyncConfig | null> {
    const config = await configService.getProviderConfig(providerConfigKey, environment_id);

    if (!config) {
        throw new Error('Provider config not found');
    }

    try {
        const result = await schema()
            .from<SyncConfig>(TABLE)
            .where({
                environment_id,
                sync_name,
                nango_config_id: config.id as number,
                active: true,
                deleted: false
            })
            .orderBy('created_at', 'desc')
            .first();

        if (result) {
            return result;
        }
    } catch (error) {
        errorManager.report(error, {
            environmentId: environment_id,
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.DATABASE,
            metadata: {
                environment_id,
                sync_name,
                providerConfigKey
            }
        });
        return null;
    }

    return null;
}

export async function getSyncConfigByParams(
    environment_id: number,
    sync_name: string,
    providerConfigKey: string,
    isAction?: boolean
): Promise<SyncConfig | null> {
    const config = await configService.getProviderConfig(providerConfigKey, environment_id);

    if (!config) {
        throw new Error('Provider config not found');
    }

    try {
        const result = await schema()
            .from<SyncConfig>(TABLE)
            .where({
                environment_id,
                sync_name,
                nango_config_id: config.id as number,
                active: true,
                enabled: true,
                type: isAction ? SyncConfigType.ACTION : SyncConfigType.SYNC,
                deleted: false
            })
            .orderBy('created_at', 'desc')
            .first();

        if (result) {
            return result;
        }
    } catch (error) {
        errorManager.report(error, {
            environmentId: environment_id,
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.DATABASE,
            metadata: {
                environment_id,
                sync_name,
                providerConfigKey
            }
        });
        return null;
    }

    return null;
}

export async function deleteSyncConfig(id: number): Promise<void> {
    await schema().from<SyncConfig>(TABLE).where({ id, deleted: false }).update({
        active: false,
        deleted: true,
        deleted_at: new Date()
    });
}

export async function disableScriptConfig(id: number): Promise<void> {
    await schema().from<SyncConfig>(TABLE).where({ id }).update({ enabled: false });
}

export async function enableScriptConfig(id: number): Promise<void> {
    await schema().from<SyncConfig>(TABLE).where({ id }).update({ enabled: true });
}

export async function deleteByConfigId(nango_config_id: number): Promise<void> {
    await schema().from<SyncConfig>(TABLE).where({ nango_config_id, deleted: false }).update({ deleted: true, deleted_at: new Date() });
}

export async function deleteSyncFilesForConfig(id: number, environmentId: number): Promise<void> {
    try {
        const files = await schema().from<SyncConfig>(TABLE).where({ nango_config_id: id, deleted: false }).select('file_location').pluck('file_location');

        if (files.length > 0) {
            await remoteFileService.deleteFiles(files);
        }
    } catch (error) {
        errorManager.report(error, {
            environmentId,
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.DATABASE,
            metadata: {
                id
            }
        });
    }
}

export async function getActiveCustomSyncConfigsByEnvironmentId(environment_id: number): Promise<SyncConfigWithProvider[]> {
    const result = await schema()
        .select(
            `${TABLE}.id`,
            `${TABLE}.sync_name`,
            `${TABLE}.runs`,
            `${TABLE}.models`,
            `${TABLE}.updated_at`,
            `${TABLE}.type`,
            '_nango_configs.provider',
            '_nango_configs.unique_key'
        )
        .from<SyncConfig>(TABLE)
        .join('_nango_configs', `${TABLE}.nango_config_id`, '_nango_configs.id')
        .where({
            active: true,
            '_nango_configs.environment_id': environment_id,
            '_nango_configs.deleted': false,
            pre_built: false,
            [`${TABLE}.deleted`]: false
        });

    return result;
}

export async function getSyncConfigsWithConnectionsByEnvironmentId(environment_id: number): Promise<(SyncConfig & ProviderConfig)[]> {
    const result = await schema()
        .select(
            `${TABLE}.id`,
            `${TABLE}.sync_name`,
            `${TABLE}.type`,
            `${TABLE}.runs`,
            `${TABLE}.models`,
            `${TABLE}.version`,
            `${TABLE}.updated_at`,
            `${TABLE}.auto_start`,
            `${TABLE}.pre_built`,
            `${TABLE}.is_public`,
            `${TABLE}.metadata`,
            '_nango_configs.provider',
            '_nango_configs.unique_key',
            db.knex.raw(
                `(
                    SELECT json_agg(
                        json_build_object(
                            'connection_id', _nango_connections.connection_id,
                            'metadata', _nango_connections.metadata
                        )
                    )
                    FROM _nango_connections
                    WHERE _nango_configs.environment_id = _nango_connections.environment_id
                    AND _nango_configs.unique_key = _nango_connections.provider_config_key
                    AND _nango_configs.deleted = false
                    AND _nango_connections.deleted = false
                ) as connections
                `
            )
        )
        .from<SyncConfig>(TABLE)
        .join('_nango_configs', `${TABLE}.nango_config_id`, '_nango_configs.id')
        .where({
            '_nango_configs.environment_id': environment_id,
            active: true,
            '_nango_configs.deleted': false,
            [`${TABLE}.deleted`]: false
        });

    return result;
}

export async function getSyncConfigsWithConnections(
    providerConfigKey: string,
    environment_id: number
): Promise<{ connections: { connection_id: string }[]; provider: string; unique_key: string }[]> {
    const result = await db.knex
        .select(
            `${TABLE}.id`,
            '_nango_configs.provider',
            '_nango_configs.unique_key',
            db.knex.raw(
                `(
                    SELECT json_agg(
                        json_build_object(
                            'connection_id', _nango_connections.connection_id
                        )
                    )
                    FROM _nango_connections
                    WHERE _nango_configs.environment_id = _nango_connections.environment_id
                    AND _nango_configs.unique_key = _nango_connections.provider_config_key
                    AND _nango_configs.deleted = false
                    AND _nango_connections.deleted = false
                ) as connections
                `
            )
        )
        .from<SyncConfig>(TABLE)
        .join('_nango_configs', `${TABLE}.nango_config_id`, '_nango_configs.id')
        .where({
            '_nango_configs.environment_id': environment_id,
            '_nango_configs.unique_key': providerConfigKey,
            active: true,
            enabled: true,
            '_nango_configs.deleted': false,
            [`${TABLE}.deleted`]: false
        });

    return result;
}

/**
 * Get Sync Configs By Provider Key
 * @desc grab all the sync configs by a provider key
 */
export async function getSyncConfigsByProviderConfigKey(environment_id: number, providerConfigKey: string): Promise<SlimSync[]> {
    const result = await schema()
        .select(`${TABLE}.sync_name as name`, `${TABLE}.id`, `${TABLE}.enabled`)
        .from<SyncConfig>(TABLE)
        .join('_nango_configs', `${TABLE}.nango_config_id`, '_nango_configs.id')
        .where({
            '_nango_configs.environment_id': environment_id,
            '_nango_configs.unique_key': providerConfigKey,
            active: true,
            '_nango_configs.deleted': false,
            [`${TABLE}.deleted`]: false
        });

    return result;
}

export async function getSyncConfigByJobId(job_id: number): Promise<SyncConfig | null> {
    const result = await schema()
        .from<SyncConfig>(TABLE)
        .select(`${TABLE}.*`)
        .join('_nango_sync_jobs', `${TABLE}.id`, '_nango_sync_jobs.sync_config_id')
        .where({
            '_nango_sync_jobs.id': job_id,
            '_nango_sync_jobs.deleted': false,
            [`${TABLE}.deleted`]: false
        })
        .first()
        .orderBy(`${TABLE}.created_at`, 'desc');

    if (!result) {
        return null;
    }

    return result;
}

export async function getAttributes(provider_config_key: string, sync_name: string): Promise<object | null> {
    const result = await schema()
        .from<SyncConfig>(TABLE)
        .select(`${TABLE}.attributes`)
        .join('_nango_configs', `${TABLE}.nango_config_id`, '_nango_configs.id')
        .where({
            '_nango_configs.unique_key': provider_config_key,
            '_nango_configs.deleted': false,
            [`${TABLE}.deleted`]: false,
            [`${TABLE}.sync_name`]: sync_name,
            [`${TABLE}.active`]: true
        })
        .first()
        .orderBy(`${TABLE}.created_at`, 'desc');

    if (!result) {
        return null;
    }

    return result.attributes;
}

export async function getProviderConfigBySyncAndAccount(sync_name: string, environment_id: number): Promise<string | null> {
    const providerConfigKey = await schema()
        .from<SyncConfig>(TABLE)
        .select('_nango_configs.unique_key')
        .join('_nango_configs', `${TABLE}.nango_config_id`, '_nango_configs.id')
        .where({
            active: true,
            sync_name,
            '_nango_configs.environment_id': environment_id,
            '_nango_configs.deleted': false,
            [`${TABLE}.deleted`]: false
        })
        .first();

    if (providerConfigKey) {
        return providerConfigKey.unique_key;
    }

    return null;
}

export function increment(input: number | string): number | string {
    if (typeof input === 'string') {
        if (input.includes('.')) {
            const valid = semver.valid(input);
            if (!valid) {
                throw new Error(`Invalid version string: ${input}`);
            }
            return semver.inc(input, 'patch') as string;
        } else {
            const num = parseInt(input);
            if (isNaN(num)) {
                throw new Error(`Invalid version string segment: ${input}`);
            }
            return (num + 1).toString();
        }
    } else if (typeof input === 'number') {
        return input + 1;
    } else {
        throw new Error(`Invalid version input: ${input}`);
    }
}

export async function getPublicConfig(environment_id: number): Promise<SyncConfig[]> {
    return schema()
        .from<SyncConfig>(TABLE)
        .select(`${TABLE}.*`, '_nango_configs.provider', '_nango_configs.unique_key')
        .join('_nango_configs', `${TABLE}.nango_config_id`, '_nango_configs.id')
        .where({
            active: true,
            pre_built: true,
            is_public: true,
            '_nango_configs.environment_id': environment_id,
            '_nango_configs.deleted': false,
            [`${TABLE}.deleted`]: false
        });
}

export async function getNangoConfigIdAndLocationFromId(id: number): Promise<{ nango_config_id: number; file_location: string } | null> {
    const result = await schema()
        .from<SyncConfig>(TABLE)
        .select(`${TABLE}.nango_config_id`, `${TABLE}.file_location`)
        .where({
            id,
            deleted: false
        })
        .first();

    if (!result) {
        return null;
    }

    return result;
}

export async function updateFrequency(sync_config_id: number, runs: string): Promise<void> {
    await schema()
        .from<SyncConfig>(TABLE)
        .update({
            runs
        })
        .where({
            id: sync_config_id,
            deleted: false,
            active: true
        });
}

export async function getConfigWithEndpointsByProviderConfigKey(environment_id: number, provider_config_key: string): Promise<StandardNangoConfig | null> {
    const syncConfigs = await schema()
        .from<SyncConfig>(TABLE)
        .select(
            `${TABLE}.id`,
            `${TABLE}.metadata`,
            `${TABLE}.sync_name`,
            `${TABLE}.pre_built`,
            `${TABLE}.is_public`,
            `${TABLE}.updated_at`,
            `${TABLE}.version`,
            `${TABLE}.runs`,
            `${TABLE}.models`,
            `${TABLE}.model_schema`,
            `${TABLE}.input`,
            `${TABLE}.type`,
            `${TABLE}.sync_type`,
            `${TABLE}.track_deletes`,
            `${TABLE}.auto_start`,
            `${TABLE}.webhook_subscriptions`,
            `${TABLE}.enabled`,
            '_nango_configs.unique_key',
            '_nango_configs.provider',
            db.knex.raw(
                `(
                    SELECT json_agg(json_build_object('method', method, 'path', path))
                    FROM _nango_sync_endpoints
                    WHERE _nango_sync_endpoints.sync_config_id = ${TABLE}.id
                ) as endpoints_object`
            )
        )
        .join('_nango_configs', `${TABLE}.nango_config_id`, '_nango_configs.id')
        .leftJoin('_nango_sync_endpoints', `${TABLE}.id`, '_nango_sync_endpoints.sync_config_id')
        .where({
            '_nango_configs.environment_id': environment_id,
            '_nango_configs.unique_key': provider_config_key,
            '_nango_configs.deleted': false,
            [`${TABLE}.deleted`]: false,
            [`${TABLE}.active`]: true
        });

    if (syncConfigs.length === 0) {
        return null;
    }

    const standardConfig = convertSyncConfigToStandardConfig(syncConfigs);

    const [config] = standardConfig;

    return config as StandardNangoConfig;
}

export async function getConfigWithEndpointsByProviderConfigKeyAndName(
    environment_id: number,
    provider_config_key: string,
    name: string
): Promise<StandardNangoConfig | null> {
    const syncConfigs = await schema()
        .from<SyncConfig>(TABLE)
        .select(
            `${TABLE}.id`,
            `${TABLE}.metadata`,
            `${TABLE}.sync_name`,
            `${TABLE}.pre_built`,
            `${TABLE}.is_public`,
            `${TABLE}.updated_at`,
            `${TABLE}.version`,
            `${TABLE}.runs`,
            `${TABLE}.models`,
            `${TABLE}.model_schema`,
            `${TABLE}.input`,
            `${TABLE}.type`,
            `${TABLE}.sync_type`,
            `${TABLE}.track_deletes`,
            `${TABLE}.auto_start`,
            `${TABLE}.webhook_subscriptions`,
            '_nango_configs.unique_key',
            '_nango_configs.provider',
            db.knex.raw(
                `(
                    SELECT json_agg(json_build_object('method', method, 'path', path))
                    FROM _nango_sync_endpoints
                    WHERE _nango_sync_endpoints.sync_config_id = ${TABLE}.id
                ) as endpoints_object`
            )
        )
        .join('_nango_configs', `${TABLE}.nango_config_id`, '_nango_configs.id')
        .join('_nango_sync_endpoints', `${TABLE}.id`, '_nango_sync_endpoints.sync_config_id')
        .where({
            '_nango_configs.environment_id': environment_id,
            '_nango_configs.unique_key': provider_config_key,
            '_nango_configs.deleted': false,
            [`${TABLE}.deleted`]: false,
            [`${TABLE}.sync_name`]: name,
            [`${TABLE}.active`]: true
        });

    if (syncConfigs.length === 0) {
        return null;
    }

    const standardConfig = convertSyncConfigToStandardConfig(syncConfigs);

    const [config] = standardConfig;

    return config as StandardNangoConfig;
}

export async function getAllSyncAndActionNames(environmentId: number): Promise<string[]> {
    const result = await schema().from<SyncConfig>(TABLE).select(`${TABLE}.sync_name`).where({
        deleted: false,
        environment_id: environmentId,
        active: true
    });

    if (!result) {
        return [];
    }

    return result.map((syncConfig: SyncConfig) => syncConfig.sync_name);
}

export async function getSyncConfigsByConfigIdForWebhook(environment_id: number, nango_config_id: number): Promise<SyncConfig[]> {
    const result = await schema()
        .from<SyncConfig>(TABLE)
        .where({
            environment_id,
            nango_config_id,
            active: true,
            deleted: false
        })
        .whereRaw('webhook_subscriptions IS NOT NULL and array_length(webhook_subscriptions, 1) > 0');

    return result;
}
