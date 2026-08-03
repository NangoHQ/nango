import * as z from 'zod/v4';

import integrationService from '../../../services/integration.service.js';
import { defineControlPlaneMcpTool } from '../controlPlaneTool.js';
import { integrationToMcp } from './formatter.js';
import { mcpIntegrationSchema } from './schema.js';

const listIntegrationsArgumentsSchema = z.object({}).strict();

const listIntegrationsOutputSchema = z
    .object({
        data: z.array(mcpIntegrationSchema)
    })
    .strict();

type ListIntegrationsOutput = z.infer<typeof listIntegrationsOutputSchema>;

export const integrationsListTool = defineControlPlaneMcpTool<typeof listIntegrationsArgumentsSchema, ListIntegrationsOutput>({
    name: 'integrations_list',
    description: 'List integrations configured in the authenticated Nango environment.',
    inputSchema: listIntegrationsArgumentsSchema,
    outputSchema: listIntegrationsOutputSchema,
    requiredScopes: { every: ['environment:integrations:list'] },
    async handler({ environment }) {
        const result = await integrationService.list({ environmentId: environment.id });
        return result.map((integrations) => ({
            data: integrations.map(({ integration, provider }) => integrationToMcp({ integration, provider }))
        }));
    }
});
