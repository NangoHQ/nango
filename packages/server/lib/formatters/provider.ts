import type { ApiProviderListItem, Provider } from '@nangohq/types';

export function providerListItemToAPI(providerName: string, properties: Provider, preConfigured: boolean, preConfiguredScopes: string[]): ApiProviderListItem {
    const item: ApiProviderListItem = {
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
    if (properties.auth_mode === 'MCP_OAUTH2' && 'client_registration' in properties) {
        item.clientRegistration = properties.client_registration;
    } else if (properties.auth_mode === 'MCP_OAUTH2') {
        item.clientRegistration = 'dynamic';
    }
    return item;
}
