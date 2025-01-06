import db from '@nangohq/database';
import connectionService from '../services/connection.service.js';
import type { NangoConnection } from '../models/Connection.js';
import type { AuthCredentials } from '../models/Auth.js';
import type { ConnectionConfig, DBEnvironment, EndUser } from '@nangohq/types';
import { linkConnection } from '../services/endUser.service.js';

export const createConnectionSeeds = async (env: DBEnvironment): Promise<number[]> => {
    const connectionIds = [];

    for (let i = 0; i < 4; i++) {
        const name = Math.random().toString(36).substring(7);
        const result = await connectionService.upsertConnection({
            connectionId: `conn-${name}`,
            providerConfigKey: `provider-${name}`,
            provider: 'google',
            parsedRawCredentials: {} as AuthCredentials,
            connectionConfig: {},
            environmentId: env.id,
            accountId: 0
        });

        for (const res of result) {
            if (!res.connection.id) {
                throw new Error('Could not create connection seed');
            }

            connectionIds.push(res.connection.id);
        }
    }
    return connectionIds;
};

export const createConnectionSeed = async ({
    env,
    provider,
    endUser,
    connectionId,
    rawCredentials,
    connectionConfig
}: {
    env: DBEnvironment;
    provider: string;
    endUser?: EndUser;
    connectionId?: string;
    rawCredentials?: AuthCredentials;
    connectionConfig?: ConnectionConfig;
}): Promise<NangoConnection> => {
    const name = connectionId ? connectionId : Math.random().toString(36).substring(7);
    const result = await connectionService.upsertConnection({
        connectionId: name,
        providerConfigKey: provider,
        provider: provider,
        parsedRawCredentials: rawCredentials || ({} as AuthCredentials),
        connectionConfig: connectionConfig || {},
        environmentId: env.id,
        accountId: 0
    });

    if (!result || result[0] === undefined || !result[0].connection.id) {
        throw new Error('Could not create connection seed');
    }
    if (endUser) {
        await linkConnection(db.knex, { endUserId: endUser.id, connection: result[0].connection });
    }

    return { id: result[0].connection.id, connection_id: name, provider_config_key: provider, environment_id: env.id };
};

export const deleteAllConnectionSeeds = async (): Promise<void> => {
    await db.knex.raw('TRUNCATE TABLE _nango_connections CASCADE');
};
