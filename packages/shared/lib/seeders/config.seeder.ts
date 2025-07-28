import configService from '../services/config.service.js';
import { getProvider } from '../services/providers.js';

import type { Config as ProviderConfig } from '../models/Provider.js';
import type { DBEnvironment, IntegrationConfig } from '@nangohq/types';

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
            ...rest,
            forward_webhooks: true,
            user_defined: true
        },
        provider
    );
    if (!created) {
        throw new Error('failed to created to provider config');
    }
    return created;
}

export function getTestConfig(data?: Partial<IntegrationConfig>): IntegrationConfig {
    return {
        created_at: new Date(),
        updated_at: new Date(),
        deleted: false,
        deleted_at: null,
        forward_webhooks: true,
        user_defined: true,
        oauth_client_id: null,
        oauth_client_secret: null,
        oauth_scopes: null,
        missing_fields: [],
        display_name: 'test',
        unique_key: 'test',
        provider: 'test',
        environment_id: 1,
        ...data
    };
}
