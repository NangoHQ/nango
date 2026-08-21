import * as z from 'zod/v4';

import {
    integrationCredentialsSchema,
    integrationDisplayNameSchema,
    integrationForwardWebhooksSchema,
    providerConfigKeySchema,
    providerSchema
} from '../../../helpers/validation.js';

const createIntegrationBaseArguments = {
    provider: providerSchema,
    integration_id: providerConfigKeySchema,
    display_name: integrationDisplayNameSchema,
    forward_webhooks: integrationForwardWebhooksSchema
};

// The MCP SDK only advertises top-level Zod object schemas; a discriminated union is emitted as an empty object schema.
// Keep this as an object and use metadata to expose the conditional fields to clients while superRefine enforces them at runtime.
export const createIntegrationArgumentsSchema = z
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

export const getIntegrationArgumentsSchema = z
    .object({
        integration_id: providerConfigKeySchema,
        include: z
            .array(z.enum(['webhook', 'credentials']))
            .max(2)
            .optional()
    })
    .strict();

export const listIntegrationsArgumentsSchema = z.object({}).strict();

export const updateIntegrationsArgumentsSchema = z
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

export const deleteIntegrationsArgumentsSchema = z
    .object({
        integration_id: providerConfigKeySchema
    })
    .strict();

const mcpIntegrationCredentialsSchema = z.discriminatedUnion('type', [
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

export const mcpIntegrationSchema = z
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
    .strict();

export const listIntegrationsOutputSchema = z
    .object({
        data: z.array(mcpIntegrationSchema)
    })
    .strict();

export const getIntegrationOutputSchema = z
    .object({
        data: mcpIntegrationSchema.extend({
            webhook_url: z.string().nullable().optional(),
            credentials: mcpIntegrationCredentialsSchema.nullable().optional()
        })
    })
    .strict();

export const createIntegrationsOutputSchema = z
    .object({
        data: mcpIntegrationSchema
    })
    .strict();

export const updateIntegrationsOutputSchema = z
    .object({
        data: mcpIntegrationSchema
    })
    .strict();

export const deleteIntegrationsOutputSchema = z
    .object({
        success: z.literal(true)
    })
    .strict();

export type ListIntegrationsOutput = z.infer<typeof listIntegrationsOutputSchema>;
export type GetIntegrationOutput = z.infer<typeof getIntegrationOutputSchema>;
export type CreateIntegrationsOutput = z.infer<typeof createIntegrationsOutputSchema>;
export type UpdateIntegrationsOutput = z.infer<typeof updateIntegrationsOutputSchema>;
export type DeleteIntegrationsOutput = z.infer<typeof deleteIntegrationsOutputSchema>;
