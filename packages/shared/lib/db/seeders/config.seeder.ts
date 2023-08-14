import db from '../database.js';
import configService from '../../services/config.service.js';
import type { Config as ProviderConfig } from '../../models/Provider.js';

export const create = async (): Promise<void> => {
    const result = await db.knex.withSchema(db.schema()).select('*').from('_nango_environments');

    for (const row of result) {
        const { id: environment_id } = row;
        await configService.createProviderConfig({
            unique_key: 'test1seed',
            provider: 'google',
            environment_id
        } as ProviderConfig);
        await configService.createProviderConfig({
            unique_key: 'test2seed',
            provider: 'google',
            environment_id
        } as ProviderConfig);
        await configService.createProviderConfig({
            unique_key: 'test3seed',
            provider: 'google',
            environment_id
        } as ProviderConfig);
        await configService.createProviderConfig({
            unique_key: 'test4seed',
            provider: 'notion',
            environment_id
        } as ProviderConfig);
    }
};

export const deleteAll = async (): Promise<void> => {
    await db.knex.raw('TRUNCATE TABLE nango._nango_configs CASCADE');
};
