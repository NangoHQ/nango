import semver from 'semver';
import db, { schema, dbNamespace } from '@nangohq/database';
import configService from '../../config.service.js';
import remoteFileService from '../../file/remote.service.js';
import { SyncType } from '../../../models/Sync.js';
import type { Action, SyncConfigWithProvider, SyncConfig } from '../../../models/Sync.js';
import { LogActionEnum } from '../../../models/Telemetry.js';
import type { NangoConnection } from '../../../models/Connection.js';
import type { Config as ProviderConfig } from '../../../models/Provider.js';
import type { NangoConfigV1, StandardNangoConfig, NangoSyncConfig } from '../../../models/NangoConfig.js';
import errorManager, { ErrorSourceEnum } from '../../../utils/error.manager.js';
import type { DBSyncConfig, NangoSyncEndpointV2, SlimSync } from '@nangohq/types';

const TABLE = dbNamespace + 'sync_configs';

type ExtendedSyncConfig = SyncConfig & { provider: string; unique_key: string; endpoints_object: NangoSyncEndpointV2[] | null };

function convertSyncConfigToStandardConfig(syncConfigs: ExtendedSyncConfig[]): StandardNangoConfig[] {
    const tmp: Record<string, StandardNangoConfig> = {};

    for (const syncConfig of syncConfigs) {
        if (!tmp[syncConfig.provider]) {
            tmp[syncConfig.provider] = {
                actions: [],
                providerConfigKey: syncConfig.unique_key,
                provider: syncConfig.provider,
                syncs: [],
                [`on-events`]: []
            };
        }

        const integration = tmp[syncConfig.provider]!;

        const input = syncConfig.input ? syncConfig.model_schema.find((m) => m.name === syncConfig.input) : undefined;
        const flowObject: NangoSyncConfig = {
            id: syncConfig.id!,
            name: syncConfig.sync_name,
            runs: syncConfig.runs,
            type: syncConfig.type,
            returns: syncConfig.models,
            description: syncConfig.metadata?.description || '',
            track_deletes: syncConfig.track_deletes,
            auto_start: syncConfig.auto_start,
            attributes: syncConfig.attributes || {},
            scopes: syncConfig.metadata?.scopes || [],
            version: syncConfig.version as string,
            is_public: syncConfig.is_public || false,
            pre_built: syncConfig.pre_built || false,
            endpoints: syncConfig.endpoints_object || [],
            input: input as any,
            enabled: syncConfig.enabled,
            models: syncConfig.model_schema as any,
            last_deployed: syncConfig.updated_at.toISOString(),
            webhookSubscriptions: syncConfig.webhook_subscriptions || [],
            json_schema: syncConfig.models_json_schema || null
        };

        if (syncConfig.type === 'sync') {
            flowObject.sync_type = syncConfig.sync_type || SyncType.FULL;
            integration['syncs'].push(flowObject);
        } else {
            integration['actions'].push(flowObject);
        }
    }

    return Object.values(tmp);
}

export async function getSyncConfig({
    nangoConnection,
    syncName,
    isAction = false
}: {
    nangoConnection: NangoConnection;
    syncName?: string;
    isAction?: boolean;
}): Promise<NangoConfigV1 | null> {
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
                sync_config_id: syncConfig.id!,
                runs: syncConfig.runs,
                type: syncConfig.type,
                returns: syncConfig.models,
                input: syncConfig.input,
                track_deletes: syncConfig.track_deletes,
                auto_start: syncConfig.auto_start,
                attributes: syncConfig.attributes || {},
                fileLocation,
                version: syncConfig.version || '',
                pre_built: syncConfig.pre_built || false,
                is_public: syncConfig.is_public || false,
                metadata: syncConfig.metadata!,
                enabled: syncConfig.enabled
            };

            nangoConfig.integrations[key] = providerConfig;
        }
    }

    return nangoConfig;
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
            type: isAction ? 'action' : 'sync',
            deleted: false
        });

    if (result) {
        return result;
    }

    return null;
}

export async function getFlowConfigsByParams(environment_id: number, providerConfigKey: string): Promise<DBSyncConfig[]> {
    const config = await configService.getProviderConfig(providerConfigKey, environment_id);

    if (!config) {
        throw new Error('Provider config not found');
    }

    const result = await db.knex.from<DBSyncConfig>(TABLE).select<DBSyncConfig[]>('*').where({
        environment_id,
        nango_config_id: config.id!,
        active: true,
        deleted: false
    });

    return result;
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
    } catch (err) {
        errorManager.report(err, {
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
            type: 'action'
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
        type: 'action'
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
        type: 'sync'
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
    } catch (err) {
        errorManager.report(err, {
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
                type: isAction ? 'action' : 'sync',
                deleted: false
            })
            .orderBy('created_at', 'desc')
            .first();

        if (result) {
            return result;
        }
    } catch (err) {
        errorManager.report(err, {
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

export async function disableScriptConfig({ id, environmentId }: { id: number; environmentId: number }): Promise<number> {
    return await db.knex.from<SyncConfig>(TABLE).where({ id, environment_id: environmentId }).update({ enabled: false });
}

export async function enableScriptConfig({ id, environmentId }: { id: number; environmentId: number }): Promise<number> {
    return await db.knex.from<SyncConfig>(TABLE).where({ id, environment_id: environmentId }).update({ enabled: true });
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
    } catch (err) {
        errorManager.report(err, {
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

export async function getSyncConfigBySyncId(syncId: string): Promise<SyncConfig | null> {
    const result = await schema()
        .from<SyncConfig>(TABLE)
        .select(`${TABLE}.*`)
        .join('_nango_syncs', `${TABLE}.id`, '_nango_syncs.sync_config_id')
        .where({
            '_nango_syncs.id': syncId
        })
        .first();

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

export async function getSyncConfigById(environmentId: number, id: number): Promise<SyncConfig | null> {
    const result = await schema()
        .from<SyncConfig>(TABLE)
        .select('*')
        .where({
            id,
            environment_id: environmentId,
            deleted: false
        })
        .first();

    return result || null;
}

export async function updateFrequency(sync_config_id: number, runs: string): Promise<number> {
    return await db.knex
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

export function getSyncConfigsAsStandardConfig(environmentId: number): Promise<StandardNangoConfig[] | null>;
export function getSyncConfigsAsStandardConfig(environmentId: number, providerConfigKey?: string, name?: string): Promise<StandardNangoConfig | null>;
export async function getSyncConfigsAsStandardConfig(
    environmentId: number,
    providerConfigKey?: string,
    name?: string
): Promise<StandardNangoConfig[] | StandardNangoConfig | null> {
    const query = db.knex
        .from<SyncConfig>(TABLE)
        .select<ExtendedSyncConfig[]>(
            `${TABLE}.*`,
            '_nango_configs.unique_key',
            '_nango_configs.provider',
            db.knex.raw(
                `(
                    SELECT json_agg(json_build_object('method', method, 'path', path, 'group', group_name))
                    FROM _nango_sync_endpoints
                    WHERE _nango_sync_endpoints.sync_config_id = ${TABLE}.id
                ) as endpoints_object`
            )
        )
        .join('_nango_configs', `${TABLE}.nango_config_id`, '_nango_configs.id')
        .where({
            '_nango_configs.environment_id': environmentId,
            '_nango_configs.deleted': false,
            [`${TABLE}.deleted`]: false,
            [`${TABLE}.active`]: true
        })
        .orderBy([{ column: 'sync_name', order: 'asc' }]);

    if (providerConfigKey) {
        query.where('_nango_configs.unique_key', providerConfigKey);
    }
    if (name) {
        query.where(`${TABLE}.sync_name`, name);
    }

    const syncConfigs = await query;
    if (syncConfigs.length === 0) {
        return null;
    }

    const standardConfig = convertSyncConfigToStandardConfig(syncConfigs);
    if (!providerConfigKey) {
        return standardConfig;
    }

    return standardConfig[0]!;
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

export async function getSyncConfigRaw(opts: { environmentId: number; config_id: number; name: string; isAction: boolean }): Promise<DBSyncConfig | null> {
    const query = db.knex
        .select<DBSyncConfig>('*')
        .where({
            environment_id: opts.environmentId,
            sync_name: opts.name,
            nango_config_id: opts.config_id,
            active: true,
            enabled: true,
            type: opts.isAction ? 'action' : 'sync',
            deleted: false
        })
        .from<DBSyncConfig>(TABLE)
        .first();

    const res = await query;

    return res || null;
}
