import type { ApiEndpoint, ApiError } from '../api.js';
import type { Tags } from '../db.js';
import type {
    AgentSessionAmbiguousConnectionsPayload,
    AgentSessionPinnedConnectionNotMatchedPayload,
    AgentSessionUnknownPinnedConnectionsPayload
} from './connections.js';
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

export interface PostAgentSessionsBody {
    tenant: {
        connections: {
            any?: { tags: Tags }[] | undefined;
            pinned?: { integration_id: string; connection_id: string }[] | undefined;
        };
    };
    toolset?: '*' | Record<string, AgentSessionIntegrationPolicyInput> | undefined;
    pinned_tools?: Record<string, string[]> | undefined;
    meta_tools?: Record<string, boolean> | undefined;
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
}

export interface AgentSessionUnknownMetaToolsPayload {
    meta_tools: string[];
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
 * The payload is not correlated to the code by the compiler on purpose: the resolver and the
 * toolset compiler both erase theirs to a plain record on the error they raise, so a
 * discriminated union here would only be a cast at the controller.
 */
export type AgentSessionCreationErrorPayload =
    | AgentSessionAmbiguousConnectionsPayload
    | AgentSessionUnknownPinnedConnectionsPayload
    | AgentSessionPinnedConnectionNotMatchedPayload
    | AgentSessionUnknownIntegrationsPayload
    | AgentSessionUnknownToolsPayload
    | AgentSessionUnsupportedFunctionTypesPayload
    | AgentSessionToolsNotInToolsetPayload
    | AgentSessionUnknownMetaToolsPayload;

export type PostAgentSessionsCreationError = ApiError<AgentSessionCreationErrorCode, undefined, AgentSessionCreationErrorPayload>;

export type PostAgentSessions = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'TODO: audit coverage pending' };
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
