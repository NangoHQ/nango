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
        if (existing) {
            track('already_connected');
            return Err(
                new PublicMcpError(`Integration '${integrationId}' is already connected in this session. You can already call its tools`, {
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
                tags: { ...session.metaTools.nangoCreateConnection.tags, [AGENT_SESSION_TAG_KEY]: session.id },
                allowedIntegrations: [integrationId],
                integrationsConfigDefaults: undefined,
                overrides: undefined,
                webhookUrlOverride: undefined
            });

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
                guidance: `Give this link to the user and wait. They open it and authorise ${integration.provider}, which is something only they can do. Once they say they are done, call the tool you wanted and it will run on the new connection.`,
                integration: integrationId,
                provider: integration.provider,
                connect_url: created.value.connectLink,
                expires_at: created.value.expiresAt.toISOString()
            });
        });
    }
});
