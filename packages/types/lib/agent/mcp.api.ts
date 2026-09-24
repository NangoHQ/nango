import type { ApiEndpoint, ApiError } from '../api.js';

export type AgentSessionMcpErrorCode = 'session_not_found';

export type PostAgentSessionMcp = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'TODO: audit coverage pending' };
    Method: 'POST';
    Path: '/session/:sessionId/mcp';
    Params: { sessionId: string };
    Body: Record<string, unknown>;
    Success: Record<string, unknown>;
    Error: ApiError<AgentSessionMcpErrorCode>;
}>;

export type GetAgentSessionMcp = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/session/:sessionId/mcp';
    Params: { sessionId: string };
    Success: Record<string, unknown>;
}>;
