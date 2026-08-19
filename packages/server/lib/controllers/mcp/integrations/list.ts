import integrationService from '../../../services/integration.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { integrationToMcp } from './formatter.js';
import { listIntegrationsArgumentsSchema, listIntegrationsOutputSchema } from './schema.js';

import type { ListIntegrationsOutput } from './schema.js';

export const listIntegrationsTool = defineManagementMcpTool<typeof listIntegrationsArgumentsSchema, ListIntegrationsOutput>({
    name: 'integrations_list',
    description: 'List integrations configured in the authenticated Nango environment.',
    inputSchema: listIntegrationsArgumentsSchema,
    outputSchema: listIntegrationsOutputSchema,
    annotations: { readOnlyHint: true },
    requiredScopes: { every: ['environment:integrations:list'] },
    audit: { kind: 'no-audit', reason: 'read-only' },
    async handler({ environment }) {
        const result = await integrationService.list({ environmentId: environment.id });
        return result.map((integrations) => ({
            data: integrations.map(({ integration, provider }) => integrationToMcp({ integration, provider }))
        }));
    }
});
