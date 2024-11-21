import db from '@nangohq/database';
import remoteFileService from '../file/remote.service.js';
import { env } from '@nangohq/utils';
import type { OnEventScriptsByProvider, OnEventScript, DBTeam, DBEnvironment, OnEventType } from '@nangohq/types';
import { increment } from './config/config.service.js';
import configService from '../config.service.js';

const TABLE = 'on_event_scripts';

function toDbEvent(eventType: OnEventType): OnEventScript['event'] {
    switch (eventType) {
        case 'post-connection-creation':
            return 'POST_CONNECTION_CREATION';
        case 'pre-connection-deletion':
            return 'PRE_CONNECTION_DELETION';
    }
}

export const onEventScriptService = {
    async update({
        environment,
        account,
        onEventScriptsByProvider
    }: {
        environment: DBEnvironment;
        account: DBTeam;
        onEventScriptsByProvider: OnEventScriptsByProvider[];
    }): Promise<void> {
        await db.knex.transaction(async (trx) => {
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
                    const event = toDbEvent(scriptEvent);

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
                await trx.insert(onEventInserts).into(TABLE);
            }
        });
    },
    getByConfig: async (configId: number, event: OnEventType): Promise<OnEventScript[]> => {
        return db.knex.from<OnEventScript>(TABLE).where({ config_id: configId, active: true, event: toDbEvent(event) });
    }
};
