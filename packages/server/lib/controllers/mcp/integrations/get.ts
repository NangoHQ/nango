import integrationService from '../../../services/integration.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { getIntegrationServiceErrorToMcp } from './errors.js';
import { integrationToMcp } from './formatter.js';
import { getIntegrationArgumentsSchema, getIntegrationOutputSchema } from './schema.js';

import type { GetIntegrationOutput } from './schema.js';

export const getIntegrationsTool = defineManagementMcpTool<typeof getIntegrationArgumentsSchema, GetIntegrationOutput>({
    name: 'integrations_get',
    title: 'Get Integration',
    description: 'Returns a configured integration by ID without developer-app credentials, optionally including its webhook URL.',
    inputSchema: getIntegrationArgumentsSchema,
    outputSchema: getIntegrationOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    requiredScopes: { anyOf: ['environment:integrations:read', 'environment:integrations:read_credentials'] },
    audit: { kind: 'no-audit', reason: 'read-only' },
    async handler({ args, environment }) {
        const result = await integrationService.get({
            environmentId: environment.id,
            environmentUuid: environment.uuid,
            integrationId: args.integration_id,
            includeWebhook: args.include.includes('webhook'),
            includeCredentials: false
        });

        return result.map((integration) => ({ data: integrationToMcp(integration) })).mapError((error) => getIntegrationServiceErrorToMcp(error));
    }
});
