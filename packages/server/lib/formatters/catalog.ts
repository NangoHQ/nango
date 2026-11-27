import { basePublicUrl, resolveSchemaRef } from '@nangohq/utils';

import { getInstantSetup } from '../services/instantSetup.js';

import type { CatalogFunction, CatalogProvider } from '../services/catalog.service.js';
import type {
    ApiCatalogFunction,
    ApiCatalogFunctionDetail,
    ApiCatalogProvider,
    ApiCatalogProviderSetup,
    NangoSyncConfig,
    Provider,
    RequiredScopes
} from '@nangohq/types';

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

function toRequiredScopes(fn: CatalogFunction): RequiredScopes | null {
    if (fn.type === 'tool') {
        const requiredScopes = fn.template.tags?.['required_scopes'];
        return typeof requiredScopes === 'object' && !Array.isArray(requiredScopes) ? requiredScopes : null;
    }

    const [first, ...rest] = fn.template.scopes ?? [];
    return first === undefined ? null : { all: [first, ...rest] };
}

export function catalogFunctionToApi(fn: CatalogFunction): ApiCatalogFunction {
    return {
        name: fn.name,
        type: fn.type,
        description: fn.description,
        required_scopes: toRequiredScopes(fn)
    };
}

function legacyFunctionModels(template: NangoSyncConfig) {
    return {
        input: template.input ?? null,
        returns: template.returns,
        json_schema: template.json_schema
    };
}

export function catalogFunctionDetailToApi(fn: CatalogFunction): ApiCatalogFunctionDetail {
    const base = catalogFunctionToApi(fn);
    switch (fn.type) {
        case 'tool':
            return {
                ...base,
                type: 'tool',
                input_json_schema: resolveSchemaRef(fn.template.json_schema, fn.template.input_schema_ref),
                output_json_schema: resolveSchemaRef(fn.template.json_schema, fn.template.output_schema_ref)
            };
        case 'action':
            return { ...base, type: 'action', ...legacyFunctionModels(fn.template) };
        case 'sync':
            return {
                ...base,
                type: 'sync',
                ...legacyFunctionModels(fn.template),
                runs: fn.template.runs ?? null,
                auto_start: fn.template.auto_start ?? false,
                track_deletes: fn.template.track_deletes ?? false
            };
    }
}
