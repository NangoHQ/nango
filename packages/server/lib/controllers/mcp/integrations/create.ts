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

// The MCP SDK only advertises top-level Zod object schemas; a discriminated union is emitted as an empty object schema.
// Keep this as an object and use metadata to expose the conditional fields to clients while superRefine enforces them at runtime.
const createIntegrationArgumentsSchema = z
    .object({
        ...createIntegrationBaseArguments,
        credential_source: z.enum(['nango', 'own']).describe('Use nango for Nango-provided credentials or own for caller-supplied credentials.'),
        credentials: integrationCredentialsSchema.optional().describe('Only applicable when credential_source is own.'),
        integration_config: z.record(z.string(), z.string().max(8192)).optional().describe('Only applicable when credential_source is own.')
    })
    .strict()
    .superRefine((args, ctx) => {
        if (args.credential_source !== 'nango') {
            return;
        }

        if (args.credentials !== undefined) {
            ctx.addIssue({
                code: 'custom',
                path: ['credentials'],
                message: 'credentials is only allowed when credential_source is own'
            });
        }

        if (args.integration_config !== undefined) {
            ctx.addIssue({
                code: 'custom',
                path: ['integration_config'],
                message: 'integration_config is only allowed when credential_source is own'
            });
        }
    })
    .meta({
        oneOf: [
            {
                properties: { credential_source: { const: 'nango' } },
                not: {
                    anyOf: [{ required: ['credentials'] }, { required: ['integration_config'] }]
                }
            },
            {
                properties: { credential_source: { const: 'own' } }
            }
        ]
    });

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
