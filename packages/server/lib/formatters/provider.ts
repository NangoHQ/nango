import type { ApiProviderListItem, Provider } from '@nangohq/types';

export function providerListItemToAPI(providerName: string, properties: Provider, preConfigured: boolean, preConfiguredScopes: string[]): ApiProviderListItem {
    return {
        name: providerName,
        displayName: properties.display_name,
        defaultScopes: properties.default_scopes,
        authMode: properties.auth_mode,
        categories: properties.categories,
        docs: properties.docs,
        docs_connect: properties.docs_connect,
        preConfigured,
        preConfiguredScopes
    };
}
