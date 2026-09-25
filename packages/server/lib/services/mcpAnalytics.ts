import { instrument } from '@posthog/mcp';
import { PostHog } from 'posthog-node';

import { report } from '@nangohq/utils';

import { envs } from '../env.js';

import type { McpServer } from '@modelcontextprotocol/server';

// Add agent_session after defining how customer-specific tool names should be grouped.
type McpType = 'management';
type McpAuthType = 'oauth' | 'apiKey';

let client: PostHog | undefined;

function getClient(): PostHog | undefined {
    if (!envs.PUBLIC_POSTHOG_KEY) {
        return undefined;
    }

    client ??= new PostHog(envs.PUBLIC_POSTHOG_KEY, { host: envs.PUBLIC_POSTHOG_HOST || 'https://app.posthog.com' });
    return client;
}

/** Instrument each request-scoped MCP server with one process-scoped PostHog client. */
export function trackMcpServer({
    server,
    mcpType,
    accountId,
    authType,
    posthogClient
}: {
    server: McpServer;
    mcpType: McpType;
    accountId: number;
    authType: McpAuthType;
    posthogClient?: PostHog;
}): void {
    try {
        const posthog = posthogClient ?? getClient();
        if (!posthog) {
            return;
        }

        instrument(server, posthog, {
            // These defaults change tool schemas and results. Usage tracking does not need them.
            context: false,
            captureModel: false,
            enableConversationId: false,
            enableExceptionAutocapture: false,
            eventProperties: () => ({ 'mcp-type': mcpType, 'mcp-auth-type': authType, 'team-id': accountId, 'account-id': accountId }),
            beforeSend: (event) => {
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

export async function shutdownMcpAnalytics(): Promise<void> {
    const posthog = client;
    client = undefined;
    if (!posthog) {
        return;
    }

    try {
        await posthog.shutdown();
    } catch (err) {
        report(err);
    }
}
