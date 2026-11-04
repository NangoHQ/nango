import type { ApiEndpoint } from '../api.js';

export interface ApiAgentGettingStarted {
    first_agent_connection_at: string | null;
    first_tool_call_at: string | null;
    dismissed_at: string | null;
}

export type GetAgentGettingStarted = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/agent-getting-started';
    Success: {
        data: ApiAgentGettingStarted;
    };
}>;

export type PostAgentGettingStartedRestart = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'POST';
    Path: '/api/v1/agent-getting-started/restart';
    Success: {
        data: ApiAgentGettingStarted;
    };
}>;

export type PostAgentGettingStartedDismiss = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'POST';
    Path: '/api/v1/agent-getting-started/dismiss';
    Success: {
        data: ApiAgentGettingStarted;
    };
}>;
