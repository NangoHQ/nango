import type { ApplicationConstructedProxyConfiguration, Provider } from '@nangohq/types';

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
