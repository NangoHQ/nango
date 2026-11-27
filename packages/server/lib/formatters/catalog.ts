import { basePublicUrl } from '@nangohq/utils';

import { getInstantSetup } from '../services/instantSetup.js';

import type { CatalogProvider } from '../services/catalog.service.js';
import type { ApiCatalogProvider } from '@nangohq/types';

const POPULAR_CATEGORY = 'popular';

export function catalogProviderToApi({ name, provider, hasManagedApp, functionCounts }: CatalogProvider): ApiCatalogProvider {
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
        instant_setup: getInstantSetup(provider, hasManagedApp),
        function_counts: { tool: functionCounts?.tools ?? 0, sync: functionCounts?.syncs ?? 0 }
    };
}
