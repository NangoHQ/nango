import db from '@nangohq/database';
import remoteFileService from './file/remote.service.js';
import { env } from '@nangohq/utils';
import type { OnEventScriptsByProvider, OnEventScript, DBTeam, DBEnvironment, OnEventType } from '@nangohq/types';
import { increment } from './sync/config/config.service.js';
import configService from './config.service.js';

const TABLE = 'on_event_scripts';

const EVENT_TYPE_MAPPINGS: Record<OnEventScript['event'], OnEventType> = {
    POST_CONNECTION_CREATION: 'post-connection-creation',
    PRE_CONNECTION_DELETION: 'pre-connection-deletion'
} as const;

export const eventTypeMapper = {
    fromDb: (event: OnEventScript['event']): OnEventType => {
        return EVENT_TYPE_MAPPINGS[event];
    },
    toDb: (eventType: OnEventType): OnEventScript['event'] => {
        for (const [key, value] of Object.entries(EVENT_TYPE_MAPPINGS)) {
            if (value === eventType) {
                return key as OnEventScript['event'];
            }
        }
        throw new Error(`Unknown event type: ${eventType}`); // This should never happen
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
    }): Promise<(OnEventScript & { providerConfigKey: string })[]> {
        return db.knex.transaction(async (trx) => {
            const onEventInserts: Omit<OnEventScript, 'id' | 'created_at' | 'updated_at'>[] = [];

            // Deactivate all previous scripts for the environment
            // This is done to ensure that we don't have any orphaned scripts when they are removed from nango.yaml
            const previousScriptVersions = await trx
                .from<OnEventScript>(TABLE)
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
                type R = Awaited<ReturnType<typeof onEventScriptService.update>>;
                const res = await trx
                    .with('inserted', (qb) => {
                        qb.insert(onEventInserts).into(TABLE).returning('*');
                    })
                    .select<R>(['inserted.*', '_nango_configs.unique_key as providerConfigKey'])
                    .from('inserted')
                    .join('_nango_configs', 'inserted.config_id', '_nango_configs.id');
                return res;
            }
            return [];
        });
    },
    getByConfig: async (configId: number, event: OnEventType): Promise<OnEventScript[]> => {
        return db.knex.from<OnEventScript>(TABLE).where({ config_id: configId, active: true, event: eventTypeMapper.toDb(event) });
    },
    diffChanges: async ({
        environmentId,
        onEventScriptsByProvider
    }: {
        environmentId: number;
        onEventScriptsByProvider: OnEventScriptsByProvider[];
    }): Promise<{
        added: (Omit<OnEventScript, 'id' | 'file_location' | 'created_at' | 'updated_at'> & { providerConfigKey: string })[];
        deleted: (OnEventScript & { providerConfigKey: string })[];
        updated: (OnEventScript & { providerConfigKey: string })[];
    }> => {
        const res: Awaited<ReturnType<typeof onEventScriptService.diffChanges>> = {
            added: [],
            deleted: [],
            updated: []
        };

        const existingScripts = await db.knex
            .select<(OnEventScript & { providerConfigKey: string })[]>(`${TABLE}.*`, '_nango_configs.unique_key as providerConfigKey')
            .from(TABLE)
            .join('_nango_configs', `${TABLE}.config_id`, '_nango_configs.id')
            .where({
                '_nango_configs.environment_id': environmentId,
                [`${TABLE}.active`]: true
            });

        // Create a map of existing scripts for easier lookup
        const existingMap = new Map(existingScripts.map((script) => [`${script.config_id}:${script.name}:${script.event}`, script]));

        for (const provider of onEventScriptsByProvider) {
            const config = await configService.getProviderConfig(provider.providerConfigKey, environmentId);
            if (!config || !config.id) continue;

            for (const script of provider.scripts) {
                const event = eventTypeMapper.toDb(script.event);
                const key = `${config.id}:${script.name}:${event}`;

                const maybeScript = existingMap.get(key);
                if (maybeScript) {
                    // Script already exists - it's an update
                    res.updated.push(maybeScript);

                    // Remove from map to track deletions
                    existingMap.delete(key);
                } else {
                    // Script doesn't exist - it's new
                    res.added.push({
                        config_id: config.id,
                        name: script.name,
                        version: '0.0.1',
                        active: true,
                        event,
                        providerConfigKey: provider.providerConfigKey
                    });
                }
            }
        }

        // Any remaining scripts in the map were not found - they are deleted
        res.deleted.push(...Array.from(existingMap.values()));

        return res;
    }
};
