import type { ApplicationConstructedProxyConfiguration, DBConnectionDecrypted, Provider } from '@nangohq/types';

export function getDefaultConnection(override?: Partial<DBConnectionDecrypted>): DBConnectionDecrypted {
    return {
        connection_id: 'a',
        created_at: new Date(),
        credentials: { type: 'API_KEY', apiKey: 'random_token' },
        end_user_id: null,
        environment_id: 1,
        provider_config_key: 'freshteam',
        updated_at: new Date(),
        connection_config: {},
        config_id: 1,
        credentials_iv: null,
        credentials_tag: null,
        deleted: false,
        deleted_at: null,
        id: -1,
        last_fetched_at: null,
        metadata: null,
        credentials_expires_at: null,
        last_refresh_failure: null,
        last_refresh_success: null,
        refresh_attempts: null,
        refresh_exhausted: false,
        ...override
    };
}

export function getDefaultProxy(
    override: Omit<Partial<ApplicationConstructedProxyConfiguration>, 'connection' | 'provider'> &
        Partial<{
            provider: Partial<ApplicationConstructedProxyConfiguration['provider']>;
        }>
): ApplicationConstructedProxyConfiguration {
    return {
        endpoint: '/api/test',
        method: 'GET',
        providerConfigKey: 'freshteam',
        providerName: 'freshteam',
        decompress: false,
        ...override,
        provider: {
            auth_mode: 'API_KEY',
            display_name: 'test',
            docs: '',
            proxy: {
                headers: {
                    authorization: 'Bearer ${apiKey}'
                }
            },
            ...override.provider
        } as Provider
    };
}
