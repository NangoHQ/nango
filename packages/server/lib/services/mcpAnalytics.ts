import { instrument } from '@posthog/mcp';

import { productTracking } from '@nangohq/shared';
import { report } from '@nangohq/utils';

import type { McpServer } from '@modelcontextprotocol/server';
import type { DBEnvironment, DBTeam, DBUser } from '@nangohq/types';

// Add agent_session after defining how customer-specific tool names should be grouped.
type McpType = 'management';
type McpAuthType = 'oauth' | 'apiKey';
type Environment = Pick<DBEnvironment, 'is_production'>;
type NamedEnvironment = Pick<DBEnvironment, 'name' | 'is_production'>;

/** Instrument each request-scoped MCP server with the shared PostHog client and account attribution. */
export function trackMcpServer({
    server,
    mcpType,
    account,
    user,
    authType,
    environment,
    environments
}: {
    server: McpServer;
    mcpType: McpType;
    account: Pick<DBTeam, 'id' | 'name'>;
    user?: Pick<DBUser, 'id'>;
    authType: McpAuthType;
    environment?: Environment;
    environments?: readonly NamedEnvironment[];
}): void {
    try {
        const posthog = productTracking.client;
        const accountAttribution = productTracking.getServerEventAttribution({ team: account, user });
        if (!posthog || !accountAttribution) {
            return;
        }

        instrument(server, posthog, {
            // These defaults change tool schemas and results. Usage tracking does not need them.
            context: false,
            captureModel: false,
            enableConversationId: false,
            enableExceptionAutocapture: false,
            eventProperties: (request) => {
                const selectedEnvironment = environment ?? environments?.find((candidate) => candidate.name === request.params?.arguments?.['environment']);
                const attribution = productTracking.getServerEventAttribution({ team: account, user, environment: selectedEnvironment });
                return { ...attribution?.properties, mcp_type: mcpType, mcp_auth_type: authType };
            },
            beforeSend: (event) => {
                event.distinct_id = accountAttribution.distinctId;
                Object.assign(event.properties, accountAttribution.properties);
                event.properties['$groups'] = accountAttribution.groups;
                if (user) {
                    // The MCP SDK disables person profiles for its anonymous identity by default.
                    delete event.properties['$process_person_profile'];
                }

                // MCP arguments, responses and errors can contain customer data or secrets.
                delete event.properties['$mcp_parameters'];
                delete event.properties['$mcp_response'];
                delete event.properties['$mcp_error_message'];
                return event;
            }
        });
    } catch (err) {
        report(err);
    }
}
