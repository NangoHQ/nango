import { schema } from '../database.js';
import configService from '../../services/config.service.js';
import environmentService from '../../services/environment.service.js';
import type { Config as ProviderConfig } from '../../models/Provider.js';

export const createConfigSeeds = async (environmentName = ''): Promise<void> => {
    let result;
    if (environmentName) {
        result = [await environmentService.createEnvironment(0, environmentName)];
    } else {
        result = await schema().select('*').from('_nango_environments');
    }

    for (const row of result) {
        const { id: environment_id } = row;
        await configService.createProviderConfig({
            unique_key: Math.random().toString(36).substring(7),
            provider: 'google',
            environment_id
        } as ProviderConfig);
        await configService.createProviderConfig({
            unique_key: Math.random().toString(36).substring(7),
            provider: 'google',
            environment_id
        } as ProviderConfig);
        await configService.createProviderConfig({
            unique_key: Math.random().toString(36).substring(7),
            provider: 'google',
            environment_id
        } as ProviderConfig);
        await configService.createProviderConfig({
            unique_key: Math.random().toString(36).substring(7),
            provider: 'notion',
            environment_id
        } as ProviderConfig);
    }
};
