import * as z from 'zod/v4';

import { hasApiKeyScope } from '@nangohq/utils';

import { providerConfigKeySchema } from '../../../helpers/validation.js';
import integrationService from '../../../services/integration.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { PublicMcpError } from '../utils.js';
import { integrationToMcp } from './formatter.js';
import { getIntegrationOutputSchema } from './schema.js';

import type { GetIntegrationOutput } from './schema.js';

const getIntegrationArgumentsSchema = z
    .object({
        integration_id: providerConfigKeySchema,
        include: z
            .array(z.enum(['webhook', 'credentials']))
            .max(2)
            .optional()
    })
    .strict();

export const getIntegrationsTool = defineManagementMcpTool<typeof getIntegrationArgumentsSchema, GetIntegrationOutput>({
    name: 'integrations_get',
    description: 'Get a configured integration by ID.',
    inputSchema: getIntegrationArgumentsSchema,
    outputSchema: getIntegrationOutputSchema,
    annotations: { readOnlyHint: true },
    requiredScopes: { anyOf: ['environment:integrations:read', 'environment:integrations:read_credentials'] },
    audit: { kind: 'no-audit', reason: 'read-only' },
    async handler({ args, environment, grantedScopes }) {
        const requestedIncludes = new Set(args.include);
        const result = await integrationService.get({
            environmentId: environment.id,
            environmentUuid: environment.uuid,
            integrationId: args.integration_id,
            includeWebhook: requestedIncludes.has('webhook'),
            includeCredentials:
                requestedIncludes.has('credentials') && hasApiKeyScope({ grantedScopes, requiredScope: 'environment:integrations:read_credentials' })
        });

        return result
            .map((integration) => ({
                data: integrationToMcp(integration)
            }))
            .mapError((error) => {
                if (error.code === 'not_found') {
                    return new PublicMcpError(error.message);
                }

                return error;
            });
    }
});
