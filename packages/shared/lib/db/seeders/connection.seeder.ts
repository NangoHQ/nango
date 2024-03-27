import db from '../database.js';
import connectionService from '../../services/connection.service.js';
import type { AuthCredentials } from '../../models/Auth.js';
import type { Environment } from '../../models/Environment.js';

export const createConnectionSeeds = async (env: Environment): Promise<number[]> => {
    const connectionIds = [];

    for (let i = 0; i < 4; i++) {
        const name = Math.random().toString(36).substring(7);
        const result = await connectionService.upsertConnection(`conn-${name}`, `provider-${name}`, 'google', {} as AuthCredentials, {}, env.id, 0);
        connectionIds.push(...result.map((res) => res.id));
    }
    return connectionIds;
};

export const deleteAllConnectionSeeds = async (): Promise<void> => {
    await db.knex.raw('TRUNCATE TABLE _nango_connections CASCADE');
};
