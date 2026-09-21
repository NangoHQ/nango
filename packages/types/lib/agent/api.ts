import type { ApiEndpoint, ApiError } from '../api.js';
import type { AuditPolicy } from '../audit-trail/event.js';
import type { Tags } from '../db.js';
import type { AgentSessionUnknownPinnedConnectionsPayload } from './connections.js';
import type { AgentSessionCreateConnectionConfig, AgentSessionEndedReason } from './session.js';
import type {
    AgentSessionToolsNotInToolsetPayload,
    AgentSessionUnknownIntegrationsPayload,
    AgentSessionUnknownToolsPayload,
    AgentSessionUnsupportedFunctionTypesPayload
} from './toolset.js';

export interface AgentSessionToolListInput {
    tools: string[];
}

export type AgentSessionIntegrationPolicyInput =
    | '*'
    | {
          allow?: AgentSessionToolListInput | '*' | undefined;
          deny?: AgentSessionToolListInput | undefined;
      };

/** A bare boolean turns a meta tool on or off, and the object form says the same thing the long way. */
export type AgentSessionMetaToolInput = boolean | { enabled: boolean; tags?: Tags | undefined };

/**
 * Only nango_create_connection takes tags, because it is the only one that creates a connection to
 * put them on. Tags anywhere else are rejected rather than accepted and dropped.
 */
export interface AgentSessionMetaToolsInput {
    nango_tool_search?: boolean | { enabled: boolean } | undefined;
    nango_execute?: boolean | { enabled: boolean } | undefined;
    nango_proxy?: boolean | { enabled: boolean } | undefined;
    nango_create_connection?: boolean | { enabled: boolean; tags?: Tags | undefined } | undefined;
}

export interface PostAgentSessionsBody {
    tenant: {
        connections: {
            any?: { tags: Tags }[] | undefined;
            pinned?: { integration_id: string; connection_id: string }[] | undefined;
        };
    };
    toolset?: '*' | Record<string, AgentSessionIntegrationPolicyInput> | undefined;
    pinned_tools?: Record<string, string[]> | undefined;
    meta_tools?: AgentSessionMetaToolsInput | undefined;
    expires_in?: string | undefined;
}

export interface AgentSessionToolsetSummary {
    connected: boolean;
    tools_pinned: number;
    tools_searchable: number;
}

export interface AgentSessionMetaToolsSummary {
    nango_tool_search: boolean;
    nango_execute: boolean;
    nango_proxy: boolean;
    nango_create_connection: AgentSessionCreateConnectionConfig;
}

export interface AgentSessionUnknownMetaToolsPayload {
    meta_tools: string[];
}

/**
 * Creating a session does not require the connections read scope, so a returned candidate names the
 * connection and nothing else. The tags that made it a candidate are on the session created
 * operation, which is where an ambiguity gets debugged.
 */
export interface AgentSessionReturnedCandidate {
    connection_id: string;
}

export interface AgentSessionAmbiguousConnectionsReply {
    integrations: Record<
        string,
        {
            match_count: number;
            candidates: AgentSessionReturnedCandidate[];
        }
    >;
}

export interface AgentSessionPinnedConnectionNotMatchedReply {
    pinned: {
        integration_id: string;
        connection_id: string;
        candidates: AgentSessionReturnedCandidate[];
    }[];
}

export type AgentSessionCreationErrorCode =
    | 'ambiguous_connections'
    | 'unknown_pinned_connection'
    | 'pinned_connection_not_matched'
    | 'unknown_integration'
    | 'unknown_tool'
    | 'unsupported_function_type'
    | 'tool_not_in_toolset'
    | 'unknown_meta_tool';

/**
 * The payload is not correlated to the code by the compiler on purpose. AgentSessionCreationError
 * carries it as a plain record, so a discriminated union here would only be a cast at the caller.
 */
export type AgentSessionCreationErrorPayload =
    | AgentSessionAmbiguousConnectionsReply
    | AgentSessionUnknownPinnedConnectionsPayload
    | AgentSessionPinnedConnectionNotMatchedReply
    | AgentSessionUnknownIntegrationsPayload
    | AgentSessionUnknownToolsPayload
    | AgentSessionUnsupportedFunctionTypesPayload
    | AgentSessionToolsNotInToolsetPayload
    | AgentSessionUnknownMetaToolsPayload;

export type PostAgentSessionsCreationError = ApiError<AgentSessionCreationErrorCode, undefined, AgentSessionCreationErrorPayload>;

export type PostAgentSessions = ApiEndpoint<{
    Audit: AuditPolicy<'agent_session', 'created', 'environment'>;
    Method: 'POST';
    Path: '/sessions';
    Body: PostAgentSessionsBody;
    Error: PostAgentSessionsCreationError;
    Success: {
        data: {
            session_id: string;
            session_token: string;
            mcp_url: string;
            expires_at: string;
            toolset: Record<string, AgentSessionToolsetSummary>;
            meta_tools: AgentSessionMetaToolsSummary;
        };
    };
}>;

export interface ApiTerminatedAgentSession {
    session_id: string;
    ended_at: string;
    reason: AgentSessionEndedReason;
}

export type DeleteAgentSession = ApiEndpoint<{
    Audit: AuditPolicy<'agent_session', 'terminated', 'environment'>;
    Method: 'DELETE';
    Path: '/sessions/:sessionId';
    Params: { sessionId: string };
    Success: {
        data: ApiTerminatedAgentSession;
    };
}>;
