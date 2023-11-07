import db, { schema } from '../database.js';
import connectionService from '../../services/connection.service.js';
import environmentService from '../../services/environment.service.js';
import type { AuthCredentials } from '../../models/Auth.js';

export const createConnectionSeeds = async (environmentName = ''): Promise<number[]> => {
    let result;
    if (environmentName) {
        result = [await environmentService.createEnvironment(0, environmentName)];
    } else {
        result = await schema().select('*').from('_nango_environments');
    }

    const connections = [];

    for (const { id: environment_id } of result) {
        const connectionParams = [
            [Math.random().toString(36).substring(7)],
            [Math.random().toString(36).substring(7)],
            [Math.random().toString(36).substring(7)],
            [Math.random().toString(36).substring(7)]
        ];

        const connectionIds = [];

        for (const [name] of connectionParams) {
            const [result] = (await connectionService.upsertConnection(
                name as string,
                name as string,
                'google',
                {} as AuthCredentials,
                {},
                environment_id,
                0
            )) as { id: number }[];
            const { id: connection_id } = result as { id: number };
            connectionIds.push(connection_id);
        }

        connections.push(...connectionIds);
    }

    return connections;
};

export const deleteAllConnectionSeeds = async (): Promise<void> => {
    await db.knex.raw('TRUNCATE TABLE nango._nango_connections CASCADE');
};
