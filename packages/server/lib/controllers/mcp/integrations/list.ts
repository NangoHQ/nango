import * as z from 'zod/v4';

import integrationService from '../../../services/integration.service.js';
import { defineControlPlaneMcpTool } from '../controlPlaneTool.js';
import { integrationToMcp } from './formatter.js';
import { integrationsListOutputSchema } from './schema.js';

import type { IntegrationsListOutput } from './schema.js';

const listIntegrationsArgumentsSchema = z.object({}).strict();

export const integrationsListTool = defineControlPlaneMcpTool<typeof listIntegrationsArgumentsSchema, IntegrationsListOutput>({
    name: 'integrations_list',
    description: 'List integrations configured in the authenticated Nango environment.',
    inputSchema: listIntegrationsArgumentsSchema,
    outputSchema: integrationsListOutputSchema,
    requiredScopes: { every: ['environment:integrations:list'] },
    async handler({ environment }) {
        const result = await integrationService.list({ environmentId: environment.id });
        return result.map((integrations) => ({
            data: integrations.map(({ integration, provider }) => integrationToMcp({ integration, provider }))
        }));
    }
});
