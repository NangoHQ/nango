import db from '../database.js';
import connectionService from '../../services/connection.service.js';
import type { AuthCredentials } from '../../models/Auth.js';

export const create = async (): Promise<number[]> => {
    const result = await db.knex.withSchema(db.schema()).select('*').from('_nango_environments');

    const connections = [];

    for (const { id: environment_id } of result) {
        const connectionParams = [
            ['test1', 'test1'],
            ['test2', 'test2'],
            ['test3', 'test3'],
            ['test4', 'test4']
        ];

        const connectionIds = [];

        for (const [name, description] of connectionParams) {
            const [result] = (await connectionService.upsertConnection(
                name as string,
                description as string,
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

export const deleteAll = async (): Promise<void> => {
    await db.knex.raw('TRUNCATE TABLE nango._nango_connections CASCADE');
};
