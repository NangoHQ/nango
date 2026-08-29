import type { OutboundUrlPolicy } from '@nangohq/egress';
import type { ApplicationConstructedProxyConfiguration, Provider } from '@nangohq/types';

/** Localhost-friendly policy for unit tests that talk to an in-process HTTP server. */
export const permissiveTestOutboundPolicy: OutboundUrlPolicy = {
    mode: 'permissive',
    denylist: new Set(),
    allowlist: [],
    blockPrivateIps: false,
    blockLinkLocal: false,
    allowedSchemes: new Set(['http:', 'https:']),
    maxRedirects: 5
};

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
