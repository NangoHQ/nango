import * as z from 'zod/v4';

import { connectionTagsSchema, endUserSchema, providerConfigKeySchema, webhookUrlSchema } from '../../../helpers/validation.js';

const organizationSchema = z
    .object({
        id: z.string().max(255),
        display_name: z.string().max(255).optional()
    })
    .strict()
    .optional();

const integrationConfigDefaultsSchema = z
    .record(
        providerConfigKeySchema,
        z
            .object({
                user_scopes: z.string().optional(),
                authorization_params: z.record(z.string(), z.string()).optional(),
                connection_config: z
                    .looseObject({
                        oauth_scopes_override: z.string().optional()
                    })
                    .optional()
            })
            .strict()
    )
    .optional();

const commonCreateConnectSessionArguments = {
    organization: organizationSchema,
    allowed_integrations: z.array(providerConfigKeySchema).optional(),
    integrations_config_defaults: integrationConfigDefaultsSchema,
    overrides: z
        .record(
            providerConfigKeySchema,
            z
                .object({
                    docs_connect: z.string().optional()
                })
                .strict()
        )
        .optional(),
    webhook_url_override: webhookUrlSchema
};

export const createConnectSessionArgumentsSchema = z
    .object({
        ...commonCreateConnectSessionArguments,
        end_user: endUserSchema.optional(),
        tags: connectionTagsSchema.optional()
    })
    .strict()
    .superRefine((args, context) => {
        if (!args.end_user && !args.tags) {
            context.addIssue({
                code: 'custom',
                message: 'At least one of end_user or tags must be provided'
            });
        }

        for (const [integrationId, defaults] of Object.entries(args.integrations_config_defaults || {})) {
            if (defaults.connection_config && 'webhook_url' in defaults.connection_config) {
                context.addIssue({
                    code: 'custom',
                    message: 'connection_config.webhook_url is not supported; use top-level webhook_url_override instead',
                    path: ['integrations_config_defaults', integrationId, 'connection_config', 'webhook_url']
                });
            }
        }
    });

export const createConnectSessionOutputSchema = z
    .object({
        token: z.string().min(1),
        connect_link: z.url(),
        expires_at: z.iso.datetime()
    })
    .strict();

export type CreateConnectSessionOutput = z.infer<typeof createConnectSessionOutputSchema>;
