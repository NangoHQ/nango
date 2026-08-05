import * as z from 'zod/v4';

const mcpEndUserSchema = z
    .object({
        id: z.string(),
        display_name: z.string().nullable(),
        email: z.string().nullable(),
        tags: z.record(z.string(), z.string()).nullable(),
        organization: z
            .object({
                id: z.string(),
                display_name: z.string().nullable()
            })
            .strict()
            .nullable()
    })
    .strict();

export const mcpConnectionSchema = z
    .object({
        id: z.number(),
        connection_id: z.string(),
        provider_config_key: z.string(),
        provider: z.string(),
        created: z.string(),
        metadata: z.record(z.string(), z.unknown()).nullable(),
        tags: z.record(z.string(), z.string()),
        errors: z.array(
            z
                .object({
                    type: z.string(),
                    log_id: z.string()
                })
                .strict()
        ),
        end_user: mcpEndUserSchema.nullable(),
        credentials: z.record(z.string(), z.unknown()).optional()
    })
    .strict();

export const listConnectionsOutputSchema = z
    .object({
        connections: z.array(mcpConnectionSchema)
    })
    .strict();

export type McpConnection = z.infer<typeof mcpConnectionSchema>;
export type ListConnectionsOutput = z.infer<typeof listConnectionsOutputSchema>;
