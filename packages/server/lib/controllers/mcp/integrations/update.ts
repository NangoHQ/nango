import * as z from 'zod/v4';

import {
    integrationCredentialsSchema,
    integrationDisplayNameSchema,
    integrationForwardWebhooksSchema,
    providerConfigKeySchema
} from '../../../helpers/validation.js';
import integrationService from '../../../services/integration.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { PublicMcpError } from '../utils.js';
import { integrationToMcp } from './formatter.js';
import { integrationsUpdateOutputSchema } from './schema.js';

import type { IntegrationServiceError } from '../../../services/integration.service.js';
import type { IntegrationsUpdateOutput } from './schema.js';

const updateIntegrationArgumentsSchema = z
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

export const integrationsUpdateTool = defineManagementMcpTool<typeof updateIntegrationArgumentsSchema, IntegrationsUpdateOutput>({
    name: 'integrations_update',
    description: 'Update a configured integration by ID.',
    inputSchema: updateIntegrationArgumentsSchema,
    outputSchema: integrationsUpdateOutputSchema,
    requiredScopes: { every: ['environment:integrations:update'] },
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
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
            .mapError((error) => integrationServiceErrorToMcp(error));
    }
});

function integrationServiceErrorToMcp(error: IntegrationServiceError): Error {
    switch (error.code) {
        case 'not_found':
        case 'integration_has_connections':
        case 'invalid_integration_config':
        case 'custom_not_allowed':
            return new PublicMcpError(error.message);
        case 'incompatible_credentials':
            return new PublicMcpError('Credentials are incompatible with the provider auth mode');
        case 'integration_exists':
            return new PublicMcpError('Integration ID already exists');
        case 'update_failed':
        case 'invalid_provider':
        case 'missing_credentials':
        case 'nango_credentials_unsupported':
        case 'shared_credentials_load_failed':
        case 'shared_credentials_not_found':
        case 'create_failed':
        case 'list_failed':
        case 'get_failed':
            return error;
    }
}
