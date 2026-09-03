import { basePublicUrl } from '@nangohq/utils';

import { toNangoFunction } from './function.js';

import type { RetrievedProvider } from '../services/provider.service.js';
import type { ApiProvider, ApiProviderListItem, NangoSyncConfig, Provider, ProviderMcpOAUTH2, ProviderTemplatesSuccess } from '@nangohq/types';

export function providerToApi({ name, provider }: RetrievedProvider): ApiProvider {
    return {
        ...provider,
        name,
        logo_url: `${basePublicUrl}/images/template-logos/${name}.svg`
    };
}

export function providerTemplatesToApi(templates: NangoSyncConfig[]): ProviderTemplatesSuccess['data'] {
    return templates.flatMap((template) => {
        const fn = toNangoFunction(template);
        return fn ? [fn] : [];
    });
}

export function providerListItemToAPI(
    providerName: string,
    properties: Provider,
    preConfigured: boolean,
    preConfiguredScopes: string[],
    availableScopes?: string[]
): ApiProviderListItem {
    const item: ApiProviderListItem = {
        name: providerName,
        displayName: properties.display_name,
        defaultScopes: properties.default_scopes,
        availableScopes,
        authMode: properties.auth_mode,
        categories: properties.categories,
        docs: properties.docs,
        docs_connect: properties.docs_connect,
        preConfigured,
        preConfiguredScopes,
        ...(properties.integration_config && { integration_config: properties.integration_config }),
        ...(properties.auth_mode === 'MCP_OAUTH2' && {
            clientRegistration: (properties as ProviderMcpOAUTH2).client_registration
        })
    };
    return item;
}
