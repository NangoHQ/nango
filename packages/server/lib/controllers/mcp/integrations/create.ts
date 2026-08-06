import * as z from 'zod/v4';

import {
    integrationCredentialsSchema,
    integrationDisplayNameSchema,
    integrationForwardWebhooksSchema,
    providerConfigKeySchema,
    providerSchema
} from '../../../helpers/validation.js';
import integrationService from '../../../services/integration.service.js';
import { defineControlPlaneMcpTool } from '../controlPlaneTool.js';
import { PublicMcpError } from '../utils.js';
import { integrationToMcp } from './formatter.js';
import { createIntegrationsOutputSchema } from './schema.js';

import type { IntegrationServiceError } from '../../../services/integration.service.js';
import type { CreateIntegrationsOutput } from './schema.js';

const createIntegrationBaseArguments = {
    provider: providerSchema,
    integration_id: providerConfigKeySchema,
    display_name: integrationDisplayNameSchema,
    forward_webhooks: integrationForwardWebhooksSchema
};

const createIntegrationArgumentsSchema = z.discriminatedUnion('credential_source', [
    z
        .object({
            ...createIntegrationBaseArguments,
            credential_source: z.literal('nango')
        })
        .strict(),
    z
        .object({
            ...createIntegrationBaseArguments,
            credential_source: z.literal('own'),
            credentials: integrationCredentialsSchema.optional(),
            integration_config: z.record(z.string(), z.string().max(8192)).optional()
        })
        .strict()
]);

export const createIntegrationsTool = defineControlPlaneMcpTool<typeof createIntegrationArgumentsSchema, CreateIntegrationsOutput>({
    name: 'integrations_create',
    description: 'Create an integration in Nango using caller-supplied or Nango-provided developer-app credentials.',
    inputSchema: createIntegrationArgumentsSchema,
    outputSchema: createIntegrationsOutputSchema,
    requiredScopes: { every: ['environment:integrations:create'] },
    audit: {
        kind: 'audit',
        resource: 'integration',
        action: 'created',
        scope: 'environment',
        metadata: ({ args }) => ({ provider: args.provider }),
        targetFromOutput: ({ output }) => ({ type: 'integration', id: output.data.unique_key })
    },
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
    },
    async handler({ args, environment }) {
        const result = await integrationService.create({
            environmentId: environment.id,
            provider: args.provider,
            uniqueKey: args.integration_id,
            credentialSource: args.credential_source,
            displayName: args.display_name,
            forwardWebhooks: args.forward_webhooks,
            ...('credentials' in args ? { credentials: args.credentials } : {}),
            ...('integration_config' in args ? { integrationConfig: args.integration_config } : {})
        });

        return result
            .map(({ integration, provider }) => ({ data: integrationToMcp({ integration, provider }) }))
            .mapError((error) => integrationServiceErrorToMcp(error));
    }
});

function integrationServiceErrorToMcp(error: IntegrationServiceError): Error {
    switch (error.code) {
        case 'invalid_provider':
            return new PublicMcpError('Invalid provider');
        case 'incompatible_credentials':
            return new PublicMcpError('Credentials are incompatible with the provider auth mode');
        case 'missing_credentials':
            return new PublicMcpError('Credentials are required for this provider');
        case 'nango_credentials_unsupported':
            return new PublicMcpError('Nango-provided credentials are only available for OAuth providers that require a developer app');
        case 'integration_exists':
            return new PublicMcpError('Integration ID already exists');
        case 'shared_credentials_not_found':
            return new PublicMcpError('Nango-provided credentials are not configured for this provider');
        case 'invalid_integration_config':
            return new PublicMcpError(error.message);
        case 'shared_credentials_load_failed':
        case 'create_failed':
        case 'list_failed':
        case 'get_failed':
        case 'not_found':
            return error;
    }
}
