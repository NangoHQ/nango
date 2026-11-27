import { basePublicUrl } from '@nangohq/utils';

import { getInstantSetup } from '../services/instantSetup.js';

import type { CatalogProvider } from '../services/catalog.service.js';
import type { ApiCatalogProvider, ApiCatalogProviderSetup, Provider } from '@nangohq/types';

const POPULAR_CATEGORY = 'popular';

function toCatalogSetup(provider: Provider, managedAppScopes: string[] | null): ApiCatalogProviderSetup {
    switch (getInstantSetup(provider, managedAppScopes !== null)) {
        case 'nango-managed-app':
            return { type: 'nango-managed-app', scopes: managedAppScopes ?? [] };
        case 'no-dev-app':
            return { type: 'none' };
        case null:
            return { type: 'required' };
    }
}

export function catalogProviderToApi({ name, provider, managedAppScopes, functionCounts }: CatalogProvider): ApiCatalogProvider {
    return {
        name,
        display_name: provider.display_name,
        categories: (provider.categories ?? []).filter((category) => category !== POPULAR_CATEGORY),
        auth_mode: provider.auth_mode,
        logo_url: `${basePublicUrl}/images/template-logos/${name}.svg`,
        docs: provider.docs,
        docs_connect: provider.docs_connect ?? null,
        setup_guide_url: provider.setup_guide_url ?? null,
        default_scopes: provider.default_scopes ?? [],
        setup: toCatalogSetup(provider, managedAppScopes),
        function_counts: { tool: functionCounts?.tools ?? 0, sync: functionCounts?.syncs ?? 0 }
    };
}
