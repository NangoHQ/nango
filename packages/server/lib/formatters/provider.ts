import { basePublicUrl, resolveSchemaRef } from '@nangohq/utils';

import { getInstantSetup } from '../services/instantSetup.js';
import { isCatalogToolTemplate } from '../services/provider.service.js';
import { toNangoFunction } from './function.js';

import type { ProviderTemplateConfig, RetrievedProvider } from '../services/provider.service.js';
import type { ApiProvider, ApiProviderFunctionCounts, ApiProviderListItem, Provider, ProviderMcpOAUTH2, ProviderTemplatesSuccess } from '@nangohq/types';

export function providerToApi({ name, provider }: RetrievedProvider): ApiProvider {
    return {
        ...provider,
        name,
        logo_url: `${basePublicUrl}/images/template-logos/${name}.svg`
    };
}

export function providerTemplatesToApi(templates: ProviderTemplateConfig[]): ProviderTemplatesSuccess['data'] {
    const functions: ProviderTemplatesSuccess['data'] = [];
    for (const template of templates) {
        if (isCatalogToolTemplate(template)) {
            functions.push({
                type: 'tool',
                name: template.name,
                description: template.description,
                input_json_schema: resolveSchemaRef(template.json_schema, template.input_schema_ref),
                output_json_schema: resolveSchemaRef(template.json_schema, template.output_schema_ref)
            });
        } else {
            const fn = toNangoFunction(template);
            if (fn) functions.push(fn);
        }
    }
    return functions;
}

export function providerListItemToAPI(
    providerName: string,
    properties: Provider,
    preConfigured: boolean,
    preConfiguredScopes: string[],
    availableScopes: string[] | undefined,
    functionCounts: ApiProviderFunctionCounts | undefined
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
        instantSetup: getInstantSetup(properties, preConfigured),
        functionCounts: functionCounts ?? { tools: 0, syncs: 0 },
        ...(properties.integration_config && { integration_config: properties.integration_config }),
        ...(properties.auth_mode === 'MCP_OAUTH2' && {
            clientRegistration: (properties as ProviderMcpOAUTH2).client_registration
        })
    };
    return item;
}
