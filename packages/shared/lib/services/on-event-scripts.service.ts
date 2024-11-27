import db from '@nangohq/database';
import remoteFileService from './file/remote.service.js';
import { env } from '@nangohq/utils';
import type { OnEventScriptsByProvider, DBOnEventScript, DBTeam, DBEnvironment, OnEventType, OnEventScript } from '@nangohq/types';
import { increment } from './sync/config/config.service.js';
import configService from './config.service.js';

const TABLE = 'on_event_scripts';

const EVENT_TYPE_MAPPINGS: Record<DBOnEventScript['event'], OnEventType> = {
    POST_CONNECTION_CREATION: 'post-connection-creation',
    PRE_CONNECTION_DELETION: 'pre-connection-deletion'
} as const;

const eventTypeMapper = {
    fromDb: (event: DBOnEventScript['event']): OnEventType => {
        return EVENT_TYPE_MAPPINGS[event];
    },
    toDb: (eventType: OnEventType): DBOnEventScript['event'] => {
        for (const [key, value] of Object.entries(EVENT_TYPE_MAPPINGS)) {
            if (value === eventType) {
                return key as DBOnEventScript['event'];
            }
        }
        throw new Error(`Unknown event type: ${eventType}`); // This should never happen
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
            createdAt: dbScript.created_at,
            updatedAt: dbScript.updated_at
        };
    }
};

export const onEventScriptService = {
    async update({
        environment,
        account,
        onEventScriptsByProvider
    }: {
        environment: DBEnvironment;
        account: DBTeam;
        onEventScriptsByProvider: OnEventScriptsByProvider[];
    }): Promise<OnEventScript[]> {
        return db.knex.transaction(async (trx) => {
            const onEventInserts: Omit<DBOnEventScript, 'id' | 'created_at' | 'updated_at'>[] = [];

            // Deactivate all previous scripts for the environment
            // This is done to ensure that we don't have any orphaned scripts when they are removed from nango.yaml
            const previousScriptVersions = await trx
                .from<DBOnEventScript>(TABLE)
                .whereRaw(`config_id IN (SELECT id FROM _nango_configs WHERE environment_id = ?)`, [environment.id])
                .where({
                    active: true
                })
                .update({
                    active: false
                })
                .returning('*');

            for (const onEventScriptByProvider of onEventScriptsByProvider) {
                const { providerConfigKey, scripts } = onEventScriptByProvider;

                const config = await configService.getProviderConfig(providerConfigKey, environment.id);
                if (!config || !config.id) {
                    continue;
                }

                for (const script of scripts) {
                    const { name, fileBody, event: scriptEvent } = script;
                    const event = eventTypeMapper.toDb(scriptEvent);

                    const previousScriptVersion = previousScriptVersions.find((p) => p.config_id === config.id && p.name === name && p.event === event);
                    const version = previousScriptVersion ? increment(previousScriptVersion.version) : '0.0.1';

                    const file_location = await remoteFileService.upload(
                        fileBody.js,
                        `${env}/account/${account.id}/environment/${environment.id}/config/${config.id}/${name}-v${version}.js`,
                        environment.id
                    );

                    if (!file_location) {
                        throw new Error(`Failed to upload the onEvent script file: ${name}`);
                    }

                    await remoteFileService.upload(
                        fileBody.ts,
                        `${env}/account/${account.id}/environment/${environment.id}/config/${config.id}/${name}.ts`,
                        environment.id
                    );

                    onEventInserts.push({
                        config_id: config.id,
                        name,
                        file_location,
                        version: version.toString(),
                        active: true,
                        event
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

    diffChanges: async ({
        environmentId,
        onEventScriptsByProvider
    }: {
        environmentId: number;
        onEventScriptsByProvider: OnEventScriptsByProvider[];
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

        // Create a map of existing scripts for easier lookup
        const previousMap = new Map(existingScripts.map((script) => [`${script.configId}:${script.name}:${script.event}`, script]));

        for (const provider of onEventScriptsByProvider) {
            const config = await configService.getProviderConfig(provider.providerConfigKey, environmentId);
            if (!config || !config.id) continue;

            for (const script of provider.scripts) {
                const key = `${config.id}:${script.name}:${script.event}`;

                const maybeScript = previousMap.get(key);
                if (maybeScript) {
                    // Script already exists - it's an update
                    res.updated.push(maybeScript);

                    // Remove from map to track deletions
                    previousMap.delete(key);
                } else {
                    // Script doesn't exist - it's new
                    res.added.push({
                        configId: config.id,
                        name: script.name,
                        version: '0.0.1',
                        active: true,
                        event: script.event,
                        providerConfigKey: provider.providerConfigKey
                    });
                }
            }
        }

        // Any remaining scripts in the map were not found - they are deleted
        res.deleted.push(...Array.from(previousMap.values()));

        return res;
    }
};
