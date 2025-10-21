import db from '@nangohq/database';

import connectionService from '../services/connection.service.js';
import { linkConnection } from '../services/endUser.service.js';

import type { AllAuthCredentials, ConnectionConfig, DBConnection, DBConnectionDecrypted, DBEnvironment, EndUser } from '@nangohq/types';

export const createConnectionSeeds = async (env: DBEnvironment): Promise<number[]> => {
    const connectionIds = [];

    for (let i = 0; i < 4; i++) {
        const name = Math.random().toString(36).substring(7);
        const result = await connectionService.upsertConnection({
            connectionId: `conn-${name}`,
            providerConfigKey: `provider-${name}`,
            parsedRawCredentials: {} as AllAuthCredentials,
            connectionConfig: {},
            environmentId: env.id
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
    connectionConfig,
    ...rest
}: {
    env: DBEnvironment;
    provider: string;
    endUser?: EndUser;
    connectionId?: string;
    rawCredentials?: AllAuthCredentials;
    connectionConfig?: ConnectionConfig;
} & Partial<
    Omit<DBConnectionDecrypted, 'id' | 'end_user_id' | 'connection_id' | 'provider_config_key' | 'connection_config' | 'environment_id'>
>): Promise<DBConnection> => {
    const name = connectionId ? connectionId : Math.random().toString(36).substring(7);
    const result = await connectionService.upsertConnection({
        connectionId: name,
        providerConfigKey: provider,
        parsedRawCredentials: rawCredentials || ({} as AllAuthCredentials),
        connectionConfig: connectionConfig || {},
        environmentId: env.id,
        ...rest
    });

    if (!result || result[0] === undefined || !result[0].connection.id) {
        throw new Error('Could not create connection seed');
    }
    if (endUser) {
        await linkConnection(db.knex, { endUserId: endUser.id, connection: result[0].connection });
    }

    return result[0].connection;
};

export const deleteAllConnectionSeeds = async (): Promise<void> => {
    await db.knex.raw('TRUNCATE TABLE _nango_connections CASCADE');
};

export function getTestConnection(override?: Partial<DBConnectionDecrypted>): DBConnectionDecrypted {
    return {
        connection_id: 'a',
        created_at: new Date(),
        credentials: { type: 'API_KEY', apiKey: 'random_token' },
        end_user_id: null,
        environment_id: 1,
        provider_config_key: 'freshteam',
        updated_at: new Date(),
        connection_config: {},
        config_id: 1,
        credentials_iv: null,
        credentials_tag: null,
        deleted: false,
        deleted_at: null,
        id: -1,
        last_fetched_at: null,
        metadata: null,
        credentials_expires_at: null,
        last_refresh_failure: null,
        last_refresh_success: null,
        refresh_attempts: null,
        refresh_exhausted: false,
        ...override
    };
}
