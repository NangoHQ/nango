import { EndUserMapper } from '@nangohq/shared';

import * as connectSessionService from '../../../services/connectSession.service.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { createConnectSessionServiceErrorToMcp } from './errors.js';
import { createConnectSessionArgumentsSchema, createConnectSessionOutputSchema } from './schema.js';

import type { CreateConnectSessionOutput } from './schema.js';

export const createConnectSessionTool = defineManagementMcpTool<typeof createConnectSessionArgumentsSchema, CreateConnectSessionOutput>({
    name: 'connect_session_create',
    description:
        'Create a short-lived Connect session for authorizing an integration. Send the returned connect_link to the end user so they can complete OAuth or enter credentials. After authorization, use connections_list to find the resulting connection. At least one of end_user or tags must be provided.',
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
