import * as z from 'zod/v4';

import integrationService from '../../../services/integration.service.js';
import { defineControlPlaneMcpTool } from '../controlPlaneTool.js';
import { integrationToMcp } from './formatter.js';

const listIntegrationsArgumentsSchema = z.object({}).strict();

const listIntegrationsOutputSchema = z
    .object({
        data: z.array(
            z
                .object({
                    unique_key: z.string(),
                    provider: z.string(),
                    display_name: z.string(),
                    logo: z.string(),
                    credentials_label: z.record(z.string(), z.string()).optional(),
                    preconfigured_credentials: z.array(z.string()).optional(),
                    forward_webhooks: z.boolean(),
                    created_at: z.string(),
                    updated_at: z.string()
                })
                .strict()
        )
    })
    .strict();

type ListIntegrationsOutput = z.infer<typeof listIntegrationsOutputSchema>;

export const integrationsListTool = defineControlPlaneMcpTool<typeof listIntegrationsArgumentsSchema, ListIntegrationsOutput>({
    name: 'integrations_list',
    description: 'List integrations configured in the authenticated Nango environment.',
    inputSchema: listIntegrationsArgumentsSchema,
    outputSchema: listIntegrationsOutputSchema,
    requiredScopes: ['environment:integrations:list'],
    async handler({ environment }) {
        const result = await integrationService.list({ environmentId: environment.id });
        return result.map((integrations) => ({
            data: integrations.map(({ integration, provider }) => integrationToMcp({ integration, provider }))
        }));
    }
});
