import * as z from 'zod/v4';

import { providerConfigKeySchema } from '../../../helpers/validation.js';
import { hasScope } from '../../../middleware/scope.middleware.js';
import integrationService from '../../../services/integration.service.js';
import { defineControlPlaneMcpTool } from '../controlPlaneTool.js';
import { PublicMcpError } from '../utils.js';
import { integrationToMcp } from './formatter.js';

const integrationCredentialsSchema = z.discriminatedUnion('type', [
    z
        .object({
            type: z.enum(['OAUTH1', 'OAUTH2', 'TBA']),
            client_id: z.string().nullable(),
            client_secret: z.string().nullable(),
            scopes: z.string().nullable(),
            webhook_secret: z.string().nullable()
        })
        .strict(),
    z
        .object({
            type: z.literal('APP'),
            app_id: z.string().nullable(),
            private_key: z.string().nullable(),
            app_link: z.string().nullable()
        })
        .strict(),
    z
        .object({
            type: z.literal('CUSTOM'),
            client_id: z.string().nullable(),
            client_secret: z.string().nullable(),
            app_id: z.string().nullable(),
            app_link: z.string().nullable(),
            private_key: z.string().nullable()
        })
        .strict()
]);

const getIntegrationArgumentsSchema = z
    .object({
        integration_id: providerConfigKeySchema,
        include: z
            .array(z.enum(['webhook', 'credentials']))
            .max(2)
            .optional()
    })
    .strict();

const getIntegrationOutputSchema = z
    .object({
        data: z
            .object({
                unique_key: z.string(),
                provider: z.string(),
                display_name: z.string(),
                logo: z.string(),
                credentials_label: z.record(z.string(), z.string()).optional(),
                preconfigured_credentials: z.array(z.string()).optional(),
                webhook_url: z.string().nullable().optional(),
                credentials: integrationCredentialsSchema.nullable().optional(),
                forward_webhooks: z.boolean(),
                created_at: z.string(),
                updated_at: z.string()
            })
            .strict()
    })
    .strict();

type GetIntegrationOutput = z.infer<typeof getIntegrationOutputSchema>;

export const integrationsGetTool = defineControlPlaneMcpTool<typeof getIntegrationArgumentsSchema, GetIntegrationOutput>({
    name: 'integrations_get',
    description: 'Get a configured integration by ID.',
    inputSchema: getIntegrationArgumentsSchema,
    outputSchema: getIntegrationOutputSchema,
    annotations: { readOnlyHint: true },
    requiredScopes: { anyOf: ['environment:integrations:read', 'environment:integrations:read_credentials'] },
    async handler({ args, environment, grantedScopes }) {
        const requestedIncludes = new Set(args.include);
        const result = await integrationService.get({
            environmentId: environment.id,
            environmentUuid: environment.uuid,
            integrationId: args.integration_id,
            includeWebhook: requestedIncludes.has('webhook'),
            includeCredentials: requestedIncludes.has('credentials') && hasScope({ grantedScopes, requiredScope: 'environment:integrations:read_credentials' })
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
