import configService from '../services/config.service.js';
import type { Config as ProviderConfig } from '../models/Provider.js';
import type { DBEnvironment, IntegrationConfig } from '@nangohq/types';
import { getProvider } from '../services/providers.js';

export const createConfigSeeds = async (env: DBEnvironment): Promise<void> => {
    const googleProvider = getProvider('google');
    if (!googleProvider) {
        throw new Error('createConfigSeeds: google provider not found');
    }

    const notionProvider = getProvider('notion');
    if (!notionProvider) {
        throw new Error('createConfigSeeds: notion provider not found');
    }

    await configService.createProviderConfig(
        {
            unique_key: Math.random().toString(36).substring(7),
            provider: 'google',
            environment_id: env.id
        } as ProviderConfig,
        googleProvider
    );
    await configService.createProviderConfig(
        {
            unique_key: Math.random().toString(36).substring(7),
            provider: 'google',
            environment_id: env.id
        } as ProviderConfig,
        googleProvider
    );
    await configService.createProviderConfig(
        {
            unique_key: Math.random().toString(36).substring(7),
            provider: 'google',
            environment_id: env.id
        } as ProviderConfig,
        googleProvider
    );
    await configService.createProviderConfig(
        {
            unique_key: Math.random().toString(36).substring(7),
            provider: 'notion',
            environment_id: env.id
        } as ProviderConfig,
        notionProvider
    );
};

export async function createConfigSeed(
    env: DBEnvironment,
    unique_key: string,
    providerName: string,
    rest?: Partial<IntegrationConfig>
): Promise<IntegrationConfig> {
    const provider = getProvider(providerName);
    if (!provider) {
        throw new Error(`createConfigSeed: ${providerName} provider not found`);
    }

    const created = await configService.createProviderConfig(
        {
            unique_key,
            provider: providerName,
            environment_id: env.id,
            ...rest
        },
        provider
    );
    if (!created) {
        throw new Error('failed to created to provider config');
    }
    return created;
}
