import * as z from 'zod/v4';

import { makeAuditTarget } from '../../../audit.js';
import {
    integrationCredentialsSchema,
    integrationDisplayNameSchema,
    integrationForwardWebhooksSchema,
    providerConfigKeySchema,
    providerSchema
} from '../../../helpers/validation.js';
import integrationService from '../../../services/integration.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { createIntegrationServiceErrorToMcp } from './errors.js';
import { integrationToMcp } from './formatter.js';
import { createIntegrationsOutputSchema } from './schema.js';

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

export const createIntegrationsTool = defineManagementMcpTool<typeof createIntegrationArgumentsSchema, CreateIntegrationsOutput>({
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
        targetFromOutput: ({ output }) => makeAuditTarget('integration', output.data.unique_key)
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
            .mapError((error) => createIntegrationServiceErrorToMcp(error));
    }
});
