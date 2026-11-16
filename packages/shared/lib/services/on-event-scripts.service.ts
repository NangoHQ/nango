import db from '@nangohq/database';
import { env } from '@nangohq/utils';

import { NangoError } from '../utils/error.js';
import { resolveLocalFileName } from '../utils/utils.js';
import configService from './config.service.js';
import remoteFileService from './file/remote.service.js';
import { increment } from './sync/config/config.service.js';
import { onEventScopeProviderKeys } from './sync/config/deployScope.js';

import type { LegacyDeployScope } from './sync/config/deployScope.js';
import type { Knex } from '@nangohq/database';
import type { DBEnvironment, DBOnEventScript, DBTeam, OnEventScript, OnEventScriptsByProvider, OnEventType } from '@nangohq/types';

const TABLE = 'on_event_scripts';

const DB_TO_API_EVENT_TYPE: Record<DBOnEventScript['event'], OnEventType> = {
    POST_CONNECTION_CREATION: 'post-connection-creation',
    PRE_CONNECTION_DELETION: 'pre-connection-deletion',
    VALIDATE_CONNECTION: 'validate-connection'
} as const;

const API_TO_DB_EVENT_TYPE: Record<OnEventType, DBOnEventScript['event']> = {
    'post-connection-creation': 'POST_CONNECTION_CREATION',
    'pre-connection-deletion': 'PRE_CONNECTION_DELETION',
    'validate-connection': 'VALIDATE_CONNECTION'
} as const;

export const eventTypeMapper = {
    fromDb: (event: DBOnEventScript['event']): OnEventType => {
        return DB_TO_API_EVENT_TYPE[event];
    },
    toDb: (eventType: OnEventType): DBOnEventScript['event'] => {
        return API_TO_DB_EVENT_TYPE[eventType];
    }
};

const dbMapper = {
    to: (script: OnEventScript): DBOnEventScript => {
        return {
            id: script.id,
            config_id: script.configId,
            name: script.name,
            file_location: script.fileLocation,
            version: script.version,
            active: script.active,
            event: eventTypeMapper.toDb(script.event),
            sdk_version: script.sdkVersion,
            created_at: script.createdAt,
            updated_at: script.updatedAt
        };
    },
    from: (dbScript: DBOnEventScript & { provider_config_key: string }): OnEventScript => {
        return {
            id: dbScript.id,
            configId: dbScript.config_id,
            providerConfigKey: dbScript.provider_config_key,
            name: dbScript.name,
            fileLocation: dbScript.file_location,
            version: dbScript.version,
            active: dbScript.active,
            event: eventTypeMapper.fromDb(dbScript.event),
            sdkVersion: dbScript.sdk_version,
            createdAt: dbScript.created_at,
            updatedAt: dbScript.updated_at
        };
    }
};

export const onEventScriptService = {
    async update(
        trx: Knex,
        {
            environment,
            account,
            onEventScriptsByProvider,
            sdkVersion,
            scope
        }: {
            environment: DBEnvironment;
            account: DBTeam;
            onEventScriptsByProvider: OnEventScriptsByProvider[];
            sdkVersion: string | undefined;
            scope: LegacyDeployScope;
        }
    ): Promise<OnEventScript[]> {
        return trx.transaction(async (trx) => {
            const onEventInserts: Omit<DBOnEventScript, 'id' | 'created_at' | 'updated_at'>[] = [];

            const providerKeys = onEventScopeProviderKeys(scope, onEventScriptsByProvider);
            const previousScriptVersions = await trx
                .from<DBOnEventScript>(TABLE)
                .whereIn('config_id', (configs) => {
                    configs.select('id').from('_nango_configs').where({ environment_id: environment.id });
                    if (providerKeys !== 'all') {
                        configs.whereIn('unique_key', providerKeys);
                    }
                })
                .where({ active: true })
                .update({ active: false })
                .returning('*');

            for (const onEventScriptByProvider of onEventScriptsByProvider) {
                const { providerConfigKey, scripts } = onEventScriptByProvider;

                const config = await configService.getProviderConfig(providerConfigKey, environment.id, trx);
                if (!config || !config.id) {
                    continue;
                }

                for (const script of scripts) {
                    const { name, fileBody, event: scriptEvent } = script;
                    const event = eventTypeMapper.toDb(scriptEvent);

                    const previousScriptVersion = previousScriptVersions.find((p) => p.config_id === config.id && p.name === name && p.event === event);
                    let version = '0.0.1';
                    if (previousScriptVersion) {
                        const incrementResult = increment(previousScriptVersion.version);
                        if (incrementResult.isErr()) {
                            throw new NangoError('invalid_previous_sync_version', {
                                syncName: name,
                                previousVersion: previousScriptVersion.version
                            });
                        }
                        version = incrementResult.value;
                    }

                    const file_location = await remoteFileService.upload({
                        content: fileBody.js,
                        destinationPath: `${env}/account/${account.id}/environment/${environment.id}/config/${config.id}/${name}-v${version}.js`,
                        destinationLocalFileName: resolveLocalFileName({ syncName: name, providerConfigKey })
                    });

                    if (!file_location) {
                        throw new Error(`Failed to upload the onEvent script file: ${name}`);
                    }

                    await remoteFileService.upload({
                        content: fileBody.ts,
                        destinationPath: `${env}/account/${account.id}/environment/${environment.id}/config/${config.id}/${name}.ts`,
                        destinationLocalFileName: `${providerConfigKey}/on-events/${name}.ts`
                    });

                    onEventInserts.push({
                        config_id: config.id,
                        name,
                        file_location,
                        version,
                        active: true,
                        event,
                        sdk_version: sdkVersion || null
                    });
                }
            }
            if (onEventInserts.length > 0) {
                const res = await trx
                    .with('inserted', (qb) => {
                        qb.insert(onEventInserts).into(TABLE).returning('*');
                    })
                    .select<(DBOnEventScript & { provider_config_key: string })[]>(['inserted.*', '_nango_configs.unique_key as provider_config_key'])
                    .from('inserted')
                    .join('_nango_configs', 'inserted.config_id', '_nango_configs.id');
                return res.map(dbMapper.from);
            }
            return [];
        });
    },

    getByEnvironmentId: async (environmentId: number): Promise<OnEventScript[]> => {
        const existingScriptsQuery = await db.knex
            .select<(DBOnEventScript & { provider_config_key: string })[]>(`${TABLE}.*`, '_nango_configs.unique_key as provider_config_key')
            .from(TABLE)
            .join('_nango_configs', `${TABLE}.config_id`, '_nango_configs.id')
            .where({
                '_nango_configs.environment_id': environmentId,
                [`${TABLE}.active`]: true
            });
        return existingScriptsQuery.map(dbMapper.from);
    },

    getByConfig: async (configId: number, event: OnEventType): Promise<DBOnEventScript[]> => {
        return db.knex.from<DBOnEventScript>(TABLE).where({ config_id: configId, active: true, event: eventTypeMapper.toDb(event) });
    },

    getByConfigAndName: async (configId: number, name: string): Promise<OnEventScript[]> => {
        const rows = await db.knex
            .select<(DBOnEventScript & { provider_config_key: string })[]>(`${TABLE}.*`, '_nango_configs.unique_key as provider_config_key')
            .from(TABLE)
            .join('_nango_configs', `${TABLE}.config_id`, '_nango_configs.id')
            .where({
                [`${TABLE}.config_id`]: configId,
                [`${TABLE}.name`]: name,
                [`${TABLE}.active`]: true
            });
        return rows.map(dbMapper.from);
    },

    diffChanges: async ({
        environmentId,
        onEventScriptsByProvider,
        scope,
        sdkVersion
    }: {
        environmentId: number;
        onEventScriptsByProvider: OnEventScriptsByProvider[];
        scope: LegacyDeployScope;
        sdkVersion: string | undefined;
    }): Promise<{
        added: Omit<OnEventScript, 'id' | 'fileLocation' | 'createdAt' | 'updatedAt'>[];
        deleted: OnEventScript[];
        updated: OnEventScript[];
    }> => {
        const res: Awaited<ReturnType<typeof onEventScriptService.diffChanges>> = {
            added: [],
            deleted: [],
            updated: []
        };

        const existingScripts = await onEventScriptService.getByEnvironmentId(environmentId);

        const providerKeys = onEventScopeProviderKeys(scope, onEventScriptsByProvider);
        const relevantExistingScripts = providerKeys === 'all' ? existingScripts : existingScripts.filter((s) => providerKeys.includes(s.providerConfigKey));

        // Create a map of existing scripts for easier lookup
        const previousMap = new Map(relevantExistingScripts.map((script) => [`${script.configId}:${script.name}:${script.event}`, script]));

        // Process incoming scripts
        for (const provider of onEventScriptsByProvider) {
            const { providerConfigKey, scripts } = provider;
            if (!scripts || scripts.length === 0) continue;

            const config = await configService.getProviderConfig(providerConfigKey, environmentId);
            if (!config || !config.id) continue; // Skip if provider config doesn't exist

            for (const script of scripts) {
                const { name, event } = script;
                const key = `${config.id}:${name}:${event}`;
                const existingScript = previousMap.get(key);

                if (existingScript) {
                    // Script exists - it's an update
                    res.updated.push(existingScript);
                    // Remove from map to track deletions
                    previousMap.delete(key);
                } else {
                    // Script doesn't exist - it's new
                    res.added.push({
                        configId: config.id,
                        name,
                        version: '0.0.1',
                        active: true,
                        event,
                        providerConfigKey,
                        sdkVersion: sdkVersion || null
                    });
                }
            }
        }

        // Any remaining scripts in the map were not found - they are deleted
        res.deleted = Array.from(previousMap.values());

        return res;
    }
};
