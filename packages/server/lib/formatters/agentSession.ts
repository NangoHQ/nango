import type { CreatedAgentSession, EndedSession } from '../services/agentSession.service.js';
import type {
    AgentSessionCompiledToolset,
    AgentSessionMetaTools,
    AgentSessionMetaToolsSummary,
    AgentSessionResolvedConnections,
    AgentSessionToolsetSummary,
    ApiCreatedAgentSession,
    ApiTerminatedAgentSession
} from '@nangohq/types';

export function createdAgentSessionToPublicApi({ session, token, mcpUrl }: CreatedAgentSession): ApiCreatedAgentSession {
    return {
        session_id: session.id,
        session_token: token,
        mcp_url: mcpUrl,
        expires_at: session.expiresAt.toISOString(),
        toolset: toolsetSummary(session.compiledToolset, session.resolvedConnections),
        meta_tools: metaToolsSummary(session.metaTools)
    };
}

export function terminatedAgentSessionToPublicApi(session: EndedSession): ApiTerminatedAgentSession {
    return {
        session_id: session.id,
        ended_at: session.endedAt.toISOString(),
        reason: session.endedReason
    };
}

export function toolsetSummary(
    toolset: AgentSessionCompiledToolset,
    resolvedConnections: AgentSessionResolvedConnections
): Record<string, AgentSessionToolsetSummary> {
    return Object.fromEntries(
        Object.entries(toolset).map(([integrationId, integration]) => [
            integrationId,
            {
                connected: Object.hasOwn(resolvedConnections, integrationId),
                tools_pinned: integration.pinned.length,
                tools_searchable: integration.searchable.length,
                ...(integration.mcpServer ? { mcp_server: integration.mcpServer } : {})
            }
        ])
    );
}

export function metaToolsSummary(metaTools: AgentSessionMetaTools): AgentSessionMetaToolsSummary {
    return {
        nango_tool_search: metaTools.nangoToolSearch,
        nango_execute: metaTools.nangoExecute,
        nango_proxy: metaTools.nangoProxy,
        nango_create_connection: metaTools.nangoCreateConnection
    };
}
