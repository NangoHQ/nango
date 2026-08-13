import * as z from 'zod/v4';

import { EndUserMapper } from '@nangohq/shared';

import { connectionTagsSchema, endUserSchema, providerConfigKeySchema, webhookUrlSchema } from '../../../helpers/validation.js';
import * as connectSessionService from '../../../services/connectSession.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { createConnectSessionServiceErrorToMcp } from './errors.js';
import { createConnectSessionOutputSchema } from './schema.js';

import type { CreateConnectSessionOutput } from './schema.js';

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

const createConnectSessionArgumentsSchema = z.union([
    z
        .object({
            ...commonCreateConnectSessionArguments,
            end_user: endUserSchema,
            tags: connectionTagsSchema.optional()
        })
        .strict(),
    z
        .object({
            ...commonCreateConnectSessionArguments,
            end_user: endUserSchema.optional(),
            tags: connectionTagsSchema
        })
        .strict()
]);

export const createConnectSessionTool = defineManagementMcpTool<typeof createConnectSessionArgumentsSchema, CreateConnectSessionOutput>({
    name: 'connect_session_create',
    description: 'Create a Connect session for an end user in the authenticated Nango environment.',
    inputSchema: createConnectSessionArgumentsSchema,
    outputSchema: createConnectSessionOutputSchema,
    requiredScopes: { every: ['environment:connect_sessions:write'] },
    audit: { kind: 'no-audit', reason: 'non-auditable' },
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
    },
    async handler({ args, account, environment, plan }) {
        const endUser = args.end_user ? EndUserMapper.apiToEndUser(args.end_user, args.organization) : null;
        const integrationsConfigDefaults = args.integrations_config_defaults
            ? Object.fromEntries(
                  Object.entries(args.integrations_config_defaults).map(([key, value]) => [
                      key,
                      {
                          user_scopes: value.user_scopes,
                          authorization_params: value.authorization_params,
                          connectionConfig: value.connection_config
                      }
                  ])
              )
            : undefined;

        const result = await connectSessionService.createConnectSession({
            account,
            environment,
            plan,
            endUser,
            tags: args.tags,
            allowedIntegrations: args.allowed_integrations,
            integrationsConfigDefaults,
            overrides: args.overrides,
            webhookUrlOverride: args.webhook_url_override
        });

        return result
            .map(({ token, connectLink, expiresAt }) => ({ token, connect_link: connectLink, expires_at: expiresAt.toISOString() }))
            .mapError((error) => createConnectSessionServiceErrorToMcp(error));
    }
});
