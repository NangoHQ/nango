import tracer from 'dd-trace';

import { Err, Ok } from '@nangohq/utils';

import { trackAgentSessionToolCall } from '../../../../services/agentSessionAnalytics.service.js';
import { AGENT_SESSION_TAG_KEY } from '../../../../services/agentSessionConnections.service.js';
import * as connectSessionService from '../../../../services/connectSession.service.js';
import { PublicMcpError } from '../../../mcp/utils.js';
import { resolveSessionConnection } from '../sessionConnection.js';
import { defineAgentSessionMcpTool } from '../sessionTool.js';
import { createConnectionInputSchema, createConnectionOutputSchema } from './schema.js';

import type { CreateConnectionOutput } from './schema.js';
import type { Result } from '@nangohq/utils';
import type { Span } from 'dd-trace';

export const createConnectionTool = defineAgentSessionMcpTool({
    name: 'nango_create_connection',
    description:
        "Start the connect flow for one of this session's integrations that has no connection yet. Returns a link for the user to open and authorise, after which the integration's tools work for the rest of the session. The user has to open it, you cannot complete this yourself. Pass reconnect to have the user authorise an integration that is already connected again, for example when it is missing a permission, or its credentials expired or ran out of refresh attempts, and it keeps the same connection.",
    inputSchema: createConnectionInputSchema,
    outputSchema: createConnectionOutputSchema,
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
    },
    isEnabled: (metaTools) => metaTools.nangoCreateConnection.enabled,
    onInvalidArguments: ({ session }) => {
        trackAgentSessionToolCall({ metaTool: 'nango_create_connection', session, errorCode: 'invalid_input' });
    },
    async handler({ args, account, environment, plan, session }) {
        const integrationId = args.integration;

        const track = (errorCode?: string) => {
            trackAgentSessionToolCall({ metaTool: 'nango_create_connection', session, integrationId, ...(errorCode ? { errorCode } : {}) });
        };

        const integration = Object.hasOwn(session.compiledToolset, integrationId) ? session.compiledToolset[integrationId] : undefined;
        if (!integration) {
            track('unknown_integration');
            return Err(
                new PublicMcpError(
                    `Integration '${integrationId}' is not one of this session's integrations, so it cannot be connected here. Use one this session has.`,
                    { code: 'unknown_integration', integrationId }
                )
            );
        }

        const existing = await resolveSessionConnection({ session, integrationId });
        if (existing && !args.reconnect) {
            track('already_connected');
            return Err(
                new PublicMcpError(
                    `Integration '${integrationId}' is already connected in this session. You can already call its tools. If the user needs to authorise it again, for example because a tool is missing a permission or its credentials expired, call this again with reconnect set to true.`,
                    { code: 'already_connected', integrationId }
                )
            );
        }

        return await tracer.trace<Promise<Result<CreateConnectionOutput>>>('server.mcp.agentSession.createConnection', async (span: Span) => {
            span.setTag('nango.agentSessionId', session.id)
                .setTag('nango.accountId', account.id)
                .setTag('nango.environmentId', environment.id)
                .setTag('nango.providerConfigKey', integrationId)
                .setTag('nango.reconnect', Boolean(existing));

            const created = await connectSessionService.createConnectSession({
                account,
                environment,
                plan,
                isPreview: false,
                endUser: null,
                integrationsConfigDefaults: undefined,
                overrides: undefined,
                webhookUrlOverride: undefined,
                // A reconnect keeps the connection's own tags, which carry the session binding when the agent created it.
                ...(existing
                    ? { reconnect: { connectionId: existing.connectionId, integrationId } }
                    : {
                          tags: { ...session.metaTools.nangoCreateConnection.tags, [AGENT_SESSION_TAG_KEY]: session.id },
                          allowedIntegrations: [integrationId]
                      })
            });

            if (created.isErr() && created.error.code === 'connection_not_found') {
                track('connection_deleted');
                return Err(
                    new PublicMcpError(
                        `The connection this session uses for '${integrationId}' was deleted, so it cannot be reconnected here. Tell the user a new session is needed to use it again.`,
                        { code: 'connection_deleted', integrationId }
                    )
                );
            }

            if (created.isErr()) {
                span.setTag('nango.error', created.error);
                track('connect_link_failed');
                return Err(
                    new PublicMcpError(
                        `The connect link for '${integrationId}' could not be created. Trying once more is reasonable, and tell the user if it keeps failing.`,
                        { code: 'connect_link_failed', integrationId }
                    )
                );
            }

            track();

            return Ok({
                guidance: `Give this link to the user and wait. They open it and authorise ${integration.provider}, which is something only they can do. Once they say they are done, call the tool you wanted and it will run on the ${existing ? 'reauthorised' : 'new'} connection.`,
                integration: integrationId,
                provider: integration.provider,
                connect_url: created.value.connectLink,
                expires_at: created.value.expiresAt.toISOString()
            });
        });
    }
});
