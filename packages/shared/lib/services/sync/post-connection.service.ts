import db from '@nangohq/database';
import remoteFileService from '../file/remote.service.js';
import { env } from '@nangohq/utils';
import type { PostConnectionScriptByProvider, PostConnectionScript, DBTeam, DBEnvironment } from '@nangohq/types';
import { increment } from './config/config.service.js';
import configService from '../config.service.js';

const TABLE = '_nango_post_connection_scripts';

export const postConnectionScriptService = {
    async update({
        environment,
        account,
        postConnectionScriptsByProvider
    }: {
        environment: DBEnvironment;
        account: DBTeam;
        postConnectionScriptsByProvider: PostConnectionScriptByProvider[];
    }): Promise<void> {
        await db.knex.transaction(async (trx) => {
            const postConnectionInserts: Omit<PostConnectionScript, 'id' | 'created_at' | 'updated_at'>[] = [];
            for (const postConnectionScriptByProvider of postConnectionScriptsByProvider) {
                const { providerConfigKey, scripts } = postConnectionScriptByProvider;

                for (const script of scripts) {
                    const { name, fileBody } = script;
                    const config = await configService.getProviderConfig(providerConfigKey, environment.id);

                    if (!config || !config.id) {
                        continue;
                    }

                    const previousScriptVersion = await trx
                        .from<PostConnectionScript>(TABLE)
                        .select('version')
                        .where({
                            config_id: config.id,
                            name,
                            active: true
                        })
                        .first();

                    const version = previousScriptVersion ? increment(previousScriptVersion.version) : '0.0.1';

                    await trx
                        .from<PostConnectionScript>(TABLE)
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
                        throw new Error(`Failed to upload the post connection script file: ${name}`);
                    }

                    await remoteFileService.upload(
                        fileBody.ts,
                        `${env}/account/${account.id}/environment/${environment.id}/config/${config.id}/${name}.ts`,
                        environment.id
                    );

                    postConnectionInserts.push({
                        config_id: config.id,
                        name,
                        file_location,
                        version: version.toString(),
                        active: true
                    });
                }
            }
            await trx.insert(postConnectionInserts).into(TABLE);
        });
    },
    getByConfig: async (configId: number): Promise<PostConnectionScript[]> => {
        return db.knex.from<PostConnectionScript>(TABLE).where({ config_id: configId, active: true });
    }
};
