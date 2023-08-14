import db from '../database.js';
import connectionService from '../../services/connection.service.js';
import type { AuthCredentials } from '../../models/Auth.js';

export const create = async (): Promise<void> => {
    const result = await db.knex.withSchema(db.schema()).select('*').from('_nango_environments');

    for (const row of result) {
        const { id: environment_id } = row;
        await connectionService.upsertConnection('test1', 'test1', 'google', {} as AuthCredentials, {}, environment_id, 0);
        await connectionService.upsertConnection('test2', 'test2', 'google', {} as AuthCredentials, {}, environment_id, 0);
        await connectionService.upsertConnection('test3', 'test3', 'google', {} as AuthCredentials, {}, environment_id, 0);
        await connectionService.upsertConnection('test4', 'test4', 'notion', {} as AuthCredentials, {}, environment_id, 0);
    }
};

export const deleteAll = async (): Promise<void> => {
    await db.knex.raw('TRUNCATE TABLE nango._nango_connections CASCADE');
};
