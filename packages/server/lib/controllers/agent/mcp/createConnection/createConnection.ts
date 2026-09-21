import tracer from 'dd-trace';

import { Err, Ok } from '@nangohq/utils';

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
        "Start the connect flow for one of this session's integrations that has no connection yet. Returns a link for the user to open and authorise, after which the integration's tools work for the rest of the session. The user has to open it, you cannot complete this yourself.",
    inputSchema: createConnectionInputSchema,
    outputSchema: createConnectionOutputSchema,
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
    },
    isEnabled: (metaTools) => metaTools.nangoCreateConnection.enabled,
    async handler({ args, account, environment, plan, session }) {
        const integrationId = args.integration;

        const integration = Object.hasOwn(session.compiledToolset, integrationId) ? session.compiledToolset[integrationId] : undefined;
        if (!integration) {
            return Err(
                new PublicMcpError(
                    `Integration '${integrationId}' is not one of this session's integrations, so it cannot be connected here. Use one this session has.`,
                    { code: 'unknown_integration', integrationId }
                )
            );
        }

        // Connecting is only ever about filling a gap. An integration that already resolved a
        // connection keeps it, so the agent cannot swap out who the session acts as.
        const existing = await resolveSessionConnection({ session, integrationId });
        if (existing) {
            return Err(
                new PublicMcpError(`Integration '${integrationId}' is already connected in this session, so there is nothing to connect. Just use its tools.`, {
                    code: 'already_connected',
                    integrationId
                })
            );
        }

        return await tracer.trace<Promise<Result<CreateConnectionOutput>>>('server.mcp.agentSession.createConnection', async (span: Span) => {
            span.setTag('nango.agentSessionId', session.id)
                .setTag('nango.accountId', account.id)
                .setTag('nango.environmentId', environment.id)
                .setTag('nango.providerConfigKey', integrationId);

            const created = await connectSessionService.createConnectSession({
                account,
                environment,
                plan,
                isPreview: false,
                endUser: null,
                // The reserved tag is what lets the session find the connection once the user is
                // done. The configured ones go on top so it also fits the customer's tenant model.
                tags: { ...session.metaTools.nangoCreateConnection.tags, [AGENT_SESSION_TAG_KEY]: session.id },
                allowedIntegrations: [integrationId],
                integrationsConfigDefaults: undefined,
                overrides: undefined,
                webhookUrlOverride: undefined
            });

            if (created.isErr()) {
                span.setTag('nango.error', created.error);
                return Err(
                    new PublicMcpError(
                        `The connect link for '${integrationId}' could not be created. Trying once more is reasonable, and tell the user if it keeps failing.`,
                        { code: 'connect_link_failed', integrationId }
                    )
                );
            }

            return Ok({
                guidance: `Give this link to the user and wait. They open it and authorise ${integration.provider}, which is something only they can do. Once they say they are done, call the tool you wanted and it will run on the new connection.`,
                integration: integrationId,
                provider: integration.provider,
                connect_url: created.value.connectLink,
                expires_at: created.value.expiresAt.toISOString()
            });
        });
    }
});
