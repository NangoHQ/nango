import providerService from '../../../services/provider.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { getProviderServiceErrorToMcp } from './errors.js';
import { providerToMcp } from './formatter.js';
import { getProviderArgumentsSchema, getProviderOutputSchema } from './schema.js';

import type { GetProviderOutput } from './schema.js';

export const getProvidersTool = defineManagementMcpTool<typeof getProviderArgumentsSchema, GetProviderOutput>({
    name: 'providers_get',
    description: 'Get one provider and optionally include its available function templates.',
    inputSchema: getProviderArgumentsSchema,
    outputSchema: getProviderOutputSchema,
    annotations: { readOnlyHint: true, openWorldHint: false },
    requiredScopes: { none: true },
    audit: { kind: 'no-audit', reason: 'read-only' },
    handler({ args }) {
        return providerService
            .get({
                providerName: args.provider,
                includeTemplates: args.include_templates
            })
            .map(providerToMcp)
            .mapError((error) => getProviderServiceErrorToMcp(error));
    }
});
