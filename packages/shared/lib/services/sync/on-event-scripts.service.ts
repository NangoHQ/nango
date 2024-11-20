import db from '@nangohq/database';
import remoteFileService from '../file/remote.service.js';
import { env } from '@nangohq/utils';
import type { OnEventScriptsByProvider, OnEventScript, DBTeam, DBEnvironment } from '@nangohq/types';
import { increment } from './config/config.service.js';
import configService from '../config.service.js';

const TABLE = 'on_event_scripts';

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
            for (const onEventScriptByProvider of onEventScriptsByProvider) {
                const { providerConfigKey, scripts } = onEventScriptByProvider;

                for (const script of scripts) {
                    const { name, fileBody } = script;
                    const config = await configService.getProviderConfig(providerConfigKey, environment.id);

                    if (!config || !config.id) {
                        continue;
                    }

                    const previousScriptVersion = await trx
                        .from<OnEventScript>(TABLE)
                        .select('version')
                        .where({
                            config_id: config.id,
                            name,
                            active: true
                        })
                        .first();

                    const version = previousScriptVersion ? increment(previousScriptVersion.version) : '0.0.1';

                    await trx
                        .from<OnEventScript>(TABLE)
                        .where({
                            config_id: config.id,
                            name
                        })
                        .update({
                            active: false
                        });

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
                        active: true
                    });
                }
            }
            await trx.insert(onEventInserts).into(TABLE);
        });
    },
    getByConfig: async (configId: number): Promise<OnEventScript[]> => {
        return db.knex.from<OnEventScript>(TABLE).where({ config_id: configId, active: true });
    }
};
