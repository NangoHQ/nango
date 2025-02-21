import type { ApplicationConstructedProxyConfiguration, DBConnectionDecrypted, Provider } from '@nangohq/types';

export function getDefaultConnection(): DBConnectionDecrypted {
    return {
        connection_id: 'a',
        created_at: new Date(),
        credentials: { type: 'API_KEY', apiKey: 'random_token' },
        end_user_id: null,
        environment_id: 1,
        provider_config_key: 'foobar',
        updated_at: new Date(),
        connection_config: {},
        config_id: 1,
        credentials_iv: null,
        credentials_tag: null,
        deleted: false,
        deleted_at: null,
        id: -1,
        last_fetched_at: null,
        metadata: null
    };
}

export function getDefaultProxy(
    override: Omit<Partial<ApplicationConstructedProxyConfiguration>, 'connection' | 'provider'> &
        Partial<{
            connection: Partial<ApplicationConstructedProxyConfiguration['connection']>;
            provider: Partial<ApplicationConstructedProxyConfiguration['provider']>;
        }>
): ApplicationConstructedProxyConfiguration {
    return {
        connectionId: 'a',
        endpoint: '/api/test',
        method: 'GET',
        providerConfigKey: 'foobar',
        providerName: 'github',
        token: '',
        ...override,
        provider: {
            auth_mode: 'API_KEY',
            display_name: 'test',
            docs: '',
            ...override.provider
        } as Provider,
        connection: { ...getDefaultConnection(), ...override.connection }
    };
}
