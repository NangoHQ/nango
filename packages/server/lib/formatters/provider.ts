import type { ApiProviderListItem, Provider, ProviderMcpOAUTH2 } from '@nangohq/types';

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
        preConfiguredScopes,
        ...(properties.auth_mode === 'MCP_OAUTH2' && {
            clientRegistration: (properties as ProviderMcpOAUTH2).client_registration
        })
    };
    return item;
}
