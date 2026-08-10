import * as z from 'zod/v4';

import { changedFields, makeAuditTarget } from '../../../audit.js';
import {
    integrationCredentialsSchema,
    integrationDisplayNameSchema,
    integrationForwardWebhooksSchema,
    providerConfigKeySchema
} from '../../../helpers/validation.js';
import integrationService from '../../../services/integration.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { updateIntegrationsServiceErrorToMcp } from './errors.js';
import { integrationToMcp } from './formatter.js';
import { updateIntegrationsOutputSchema } from './schema.js';

import type { UpdateIntegrationsOutput } from './schema.js';

const updateIntegrationsArgumentsSchema = z
    .object({
        integration_id: providerConfigKeySchema,
        new_integration_id: providerConfigKeySchema.optional(),
        display_name: integrationDisplayNameSchema,
        credentials: integrationCredentialsSchema.optional(),
        forward_webhooks: integrationForwardWebhooksSchema,
        integration_config: z.record(z.string(), z.string().max(8192)).optional(),
        custom: z.record(z.string(), z.string()).optional()
    })
    .strict();

export const updateIntegrationsTool = defineManagementMcpTool<typeof updateIntegrationsArgumentsSchema, UpdateIntegrationsOutput>({
    name: 'integrations_update',
    description: 'Update a configured integration by ID.',
    inputSchema: updateIntegrationsArgumentsSchema,
    outputSchema: updateIntegrationsOutputSchema,
    requiredScopes: { every: ['environment:integrations:update'] },
    audit: {
        kind: 'audit',
        resource: 'integration',
        action: 'updated',
        scope: 'environment',
        metadata: ({ args }) => {
            const fields = changedFields(args)
                ?.filter((field) => field !== 'integration_id')
                .map((field) => (field === 'new_integration_id' ? 'unique_key' : field));
            return fields && fields.length > 0 ? { changedFields: fields } : undefined;
        },
        targetFromOutput: ({ output }) => makeAuditTarget('integration', output.data.unique_key)
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        // Renames are not retry-safe because replaying the old integration_id returns not_found.
        idempotentHint: false,
        openWorldHint: false
    },
    async handler({ args, environment }) {
        const result = await integrationService.update({
            environmentId: environment.id,
            integrationId: args.integration_id,
            newIntegrationId: args.new_integration_id,
            displayName: args.display_name,
            credentials: args.credentials,
            forwardWebhooks: args.forward_webhooks,
            integrationConfig: args.integration_config,
            custom: args.custom
        });

        return result
            .map(({ integration, provider }) => ({ data: integrationToMcp({ integration, provider }) }))
            .mapError((error) => updateIntegrationsServiceErrorToMcp(error));
    }
});
