import * as z from 'zod/v4';

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
            credentials: integrationCredentialsSchema.nullable().optional()
        })
    })
    .strict();

export const integrationsCreateOutputSchema = z
    .object({
        data: mcpIntegrationSchema
    })
    .strict();

export type ListIntegrationsOutput = z.infer<typeof listIntegrationsOutputSchema>;
export type GetIntegrationOutput = z.infer<typeof getIntegrationOutputSchema>;
export type IntegrationsCreateOutput = z.infer<typeof integrationsCreateOutputSchema>;
