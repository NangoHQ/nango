import configService from '../services/config.service.js';
import type { Config as ProviderConfig } from '../models/Provider.js';
import type { DBEnvironment } from '@nangohq/types';

export const createConfigSeeds = async (env: DBEnvironment): Promise<void> => {
    await configService.createProviderConfig({
        unique_key: Math.random().toString(36).substring(7),
        provider: 'google',
        environment_id: env.id
    } as ProviderConfig);
    await configService.createProviderConfig({
        unique_key: Math.random().toString(36).substring(7),
        provider: 'google',
        environment_id: env.id
    } as ProviderConfig);
    await configService.createProviderConfig({
        unique_key: Math.random().toString(36).substring(7),
        provider: 'google',
        environment_id: env.id
    } as ProviderConfig);
    await configService.createProviderConfig({
        unique_key: Math.random().toString(36).substring(7),
        provider: 'notion',
        environment_id: env.id
    } as ProviderConfig);
};

export const createConfigSeed = async (env: DBEnvironment, unique_key: string, provider: string): Promise<void | Pick<ProviderConfig, 'id'>[]> => {
    return configService.createProviderConfig({
        unique_key,
        provider,
        environment_id: env.id
    } as ProviderConfig);
};
