import * as z from 'zod/v4';

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

export const mcpIntegrationOutputSchema = z
    .object({
        data: mcpIntegrationSchema
    })
    .strict();

export type McpIntegrationOutput = z.infer<typeof mcpIntegrationOutputSchema>;
