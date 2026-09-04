import * as z from 'zod/v4';

import { CONNECTION_LIST_MAX_LIMIT, connectionTagsSchema } from '@nangohq/shared';

import { connectionIdSchema, endUserSchema, providerConfigKeySchema } from '../../../helpers/validation.js';

export const listConnectionsArgumentsSchema = z
    .object({
        connection_id: connectionIdSchema.min(1).optional(),
        search: z.string().min(1).max(255).optional(),
        end_user_id: endUserSchema.shape.id.optional(),
        integration_id: providerConfigKeySchema.min(1).optional(),
        end_user_organization_id: z.string().min(1).max(255).optional(),
        tags: connectionTagsSchema.optional(),
        limit: z.number().int().min(1).max(CONNECTION_LIST_MAX_LIMIT).optional(),
        page: z.number().int().min(0).optional()
    })
    .strict();

export const getConnectionArgumentsSchema = z
    .object({
        connection_id: connectionIdSchema.min(1),
        integration_id: providerConfigKeySchema.min(1),
        refresh_token: z.boolean().optional(),
        force_refresh: z.boolean().optional(),
        refresh_github_app_jwt_token: z.boolean().optional()
    })
    .strict();

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
        end_user: mcpEndUserSchema.nullable()
    })
    .strict();

export const listConnectionsOutputSchema = z
    .object({
        connections: z.array(mcpConnectionSchema)
    })
    .strict();

export const mcpConnectionFullSchema = mcpConnectionSchema
    .omit({ created: true })
    .extend({
        connection_config: z.record(z.string(), z.unknown()),
        webhook_url_override: z.string().nullable(),
        created_at: z.string(),
        updated_at: z.string(),
        last_fetched_at: z.string().nullable(),
        credentials: z.record(z.string(), z.unknown()).optional()
    })
    .strict();

export const getConnectionOutputSchema = mcpConnectionFullSchema;

export type McpConnection = z.infer<typeof mcpConnectionSchema>;
export type McpConnectionFull = z.infer<typeof mcpConnectionFullSchema>;
export type ListConnectionsOutput = z.infer<typeof listConnectionsOutputSchema>;
export type GetConnectionOutput = z.infer<typeof getConnectionOutputSchema>;
