import semver from 'semver';
import db, { schema, dbNamespace } from '../../../db/database.js';
import configService from '../../config.service.js';
import remoteFileService from '../../file/remote.service.js';
import { LogActionEnum } from '../../../models/Activity.js';
import { Action, SyncConfigWithProvider, SyncConfig, SlimSync, SyncConfigType } from '../../../models/Sync.js';
import { convertConfigObject } from '../../nango-config.service.js';
import type { NangoConnection } from '../../../models/Connection.js';
import type { Config as ProviderConfig } from '../../../models/Provider.js';
import type { NangoConfig, SimplifiedNangoIntegration } from '../../../integrations/index.js';
import errorManager, { ErrorSourceEnum } from '../../../utils/error.manager.js';

const TABLE = dbNamespace + 'sync_configs';

export async function getSyncConfig(nangoConnection: NangoConnection, syncName?: string, isAction?: boolean): Promise<NangoConfig | null> {
    let syncConfigs;

    if (!syncName) {
        syncConfigs = await getSyncConfigsByParams(nangoConnection.environment_id, nangoConnection.provider_config_key, isAction);

        if (!syncConfigs || syncConfigs.length === 0) {
            return null;
        }
    } else {
        syncConfigs = await getSyncConfigByParams(nangoConnection.environment_id as number, syncName, nangoConnection.provider_config_key as string, isAction);
        if (!syncConfigs) {
            return null;
        }

        // this is an array because sometimes we don't know the sync name, but regardless
        // we want to iterate over the sync configs
        syncConfigs = [syncConfigs];
    }

    const nangoConfig: NangoConfig = {
        integrations: {
            [nangoConnection.provider_config_key as string]: {}
        },
        models: {}
    };

    for (const syncConfig of syncConfigs) {
        if (nangoConnection.provider_config_key !== undefined) {
            const key = nangoConnection.provider_config_key;

            const providerConfig = nangoConfig.integrations[key] ?? {};

            providerConfig[syncConfig.sync_name] = {
                sync_config_id: syncConfig.id as number,
                runs: syncConfig.runs,
                type: syncConfig.type,
                returns: syncConfig.models,
                track_deletes: syncConfig.track_deletes,
                auto_start: syncConfig.auto_start,
                attributes: syncConfig.attributes || {},
                fileLocation: syncConfig.file_location,
                version: syncConfig.version as string,
                pre_built: syncConfig.pre_built as boolean,
                is_public: syncConfig.is_public as boolean
            };

            nangoConfig.integrations[key] = providerConfig;
        }
    }

    return nangoConfig;
}

export async function getAllSyncsAndActions(environment_id: number): Promise<SimplifiedNangoIntegration[]> {
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
            `${TABLE}.version`,
            `${TABLE}.metadata`,
            '_nango_configs.provider',
            '_nango_configs.unique_key'
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

    const nangoConfig: NangoConfig = {
        integrations: {},
        models: {}
    };

    for (const syncConfig of syncConfigs) {
        if (!syncConfig) {
            continue;
        }

        const uniqueKey = syncConfig.unique_key;

        if (!uniqueKey) {
            continue;
        }

        if (!nangoConfig['integrations'][uniqueKey]) {
            nangoConfig['integrations'][uniqueKey] = {};
            nangoConfig['integrations'][uniqueKey]!['provider'] = syncConfig.provider;
        }
        const syncName = syncConfig.sync_name;

        nangoConfig['integrations'][uniqueKey]![syncName] = {
            runs: syncConfig.runs,
            type: syncConfig.type,
            returns: syncConfig.models,
            metadata: syncConfig.metadata,
            track_deletes: syncConfig.track_deletes,
            auto_start: syncConfig.auto_start,
            attributes: syncConfig.attributes || {},
            version: syncConfig.version as string
        };
    }

    type extendedSyncConfig = SyncConfig & { provider: string; unique_key: string };

    const simlpleConfig = convertConfigObject(nangoConfig);
    const configWithModels = simlpleConfig.map((config: SimplifiedNangoIntegration) => {
        const { providerConfigKey } = config;
        for (const sync of [...config.syncs, ...config.actions]) {
            const { name } = sync;
            const model_schema = syncConfigs.find(
                (syncConfig: extendedSyncConfig) => syncConfig.sync_name === name && syncConfig.unique_key === providerConfigKey
            )?.model_schema;
            for (const model of model_schema) {
                if (Array.isArray(model.fields) && Array.isArray(model.fields[0])) {
                    model.fields = model.fields.flat();
                }
            }
            sync.models = model_schema;
        }

        return config;
    });

    return configWithModels;
}

export async function getSyncConfigsByParams(environment_id: number, providerConfigKey: string, isAction?: boolean): Promise<SyncConfig[] | null> {
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
            type: isAction ? SyncConfigType.ACTION : SyncConfigType.SYNC,
            deleted: false
        });

    if (result) {
        return result;
    }

    return null;
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
        await errorManager.report(error, {
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
        await errorManager.report(error, {
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
                type: isAction ? SyncConfigType.ACTION : SyncConfigType.SYNC,
                deleted: false
            })
            .orderBy('created_at', 'desc')
            .first();

        if (result) {
            return result;
        }
    } catch (error) {
        await errorManager.report(error, {
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
    await schema().from<SyncConfig>(TABLE).where({ id, deleted: false }).update({ active: false, deleted: true, deleted_at: new Date() });
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
        await errorManager.report(error, {
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
                    FROM nango._nango_connections
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

/**
 * Get Sync Configs By Provider Key
 * @desc grab all the sync configs by a provider key
 */
export async function getSyncConfigsByProviderConfigKey(environment_id: number, providerConfigKey: string): Promise<SlimSync[]> {
    const result = await schema()
        .select(`${TABLE}.sync_name as name`, `${TABLE}.id`)
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
            [`${TABLE}.id`]: id,
            [`${TABLE}.deleted`]: false
        })
        .first();

    if (!result) {
        return null;
    }

    return result;
}
