import { getProviders } from '@nangohq/shared';

import type { Provider } from '@nangohq/types';

interface SupportedApiKeyProviderMatch {
    providerKey: string;
    displayName: string;
    baseUrl: string;
}

export function findSupportedApiKeyProvidersByBaseUrl(baseUrl: string): SupportedApiKeyProviderMatch[] {
    const normalizedBaseUrl = normalizeStaticBaseUrl(baseUrl);
    if (!normalizedBaseUrl) {
        return [];
    }

    const providers = getProviders();
    if (!providers) {
        return [];
    }

    return Object.entries(providers).flatMap(([providerKey, provider]) => {
        if (providerKey === 'generic-api-key' || provider.auth_mode !== 'API_KEY') {
            return [];
        }

        const providerBaseUrl = getStaticProviderBaseUrl(provider);
        if (!providerBaseUrl) {
            return [];
        }

        const normalizedProviderBaseUrl = normalizeStaticBaseUrl(providerBaseUrl);
        if (!normalizedProviderBaseUrl || normalizedProviderBaseUrl !== normalizedBaseUrl) {
            return [];
        }

        return [
            {
                providerKey,
                displayName: provider.display_name,
                baseUrl: providerBaseUrl
            }
        ];
    });
}

export function getGenericApiKeySupportedProviderMessage(matches: SupportedApiKeyProviderMatch[]): string {
    const providerNames = matches.map((match) => `${match.displayName} (${match.providerKey})`);
    const providerList = providerNames.length === 1 ? providerNames[0] : `${providerNames.slice(0, -1).join(', ')} or ${providerNames.at(-1)}`;

    return `Nango already supports this API through the ${providerList} integration. Generic API Key is intended for private APIs or public APIs that Nango does not support yet. Use the provider-specific integration instead.`;
}

function getStaticProviderBaseUrl(provider: Provider): string | null {
    const baseUrl = provider.proxy?.base_url;
    if (!baseUrl || baseUrl.includes('${')) {
        return null;
    }

    return baseUrl;
}

function normalizeStaticBaseUrl(baseUrl: string): string | null {
    if (baseUrl.includes('${')) {
        return null;
    }

    try {
        const parsed = new URL(baseUrl);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return null;
        }

        const path = parsed.pathname.replace(/\/+$/, '');
        return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.port ? `:${parsed.port}` : ''}${path}`;
    } catch {
        return null;
    }
}
