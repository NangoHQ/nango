import type { ApiEndpoint, ApiError } from '../api.js';
import type { PostAgentSessionsBody } from './api.js';

export interface AgentPlaygroundUsage {
    inputTokens: number;
    outputTokens: number;
}

export interface AgentPlaygroundIntegrationSetup {
    provider: string;
    integrationId?: string;
    outcome: 'created' | 'existing' | 'missing_credentials' | 'not_created';
}

export type AgentPlaygroundSessionChange = 'integrations_changed' | 'connections_changed';

export interface AgentPlaygroundSessionCreated {
    request: PostAgentSessionsBody;
    reason?: AgentPlaygroundSessionChange | 'expired';
}

export interface AgentPlaygroundMessageMetadata {
    sessionId?: string;
    sessionExpiresAt?: string;
    hidden?: boolean;
    connectedIntegrations?: string[];
    starterProvider?: string;
    integrationSetup?: AgentPlaygroundIntegrationSetup;
    sessionCreated?: AgentPlaygroundSessionCreated;
    usage?: AgentPlaygroundUsage;
    // Sits on the user's message when the reply ended before any of it arrived.
    replyOutcome?: AgentPlaygroundReplyOutcome;
}

export type AgentPlaygroundReplyOutcome = { kind: 'stopped' } | { kind: 'failed'; error: string };

export type AgentPlaygroundErrorCode = 'feature_disabled' | 'session_creation_failed' | 'model_error' | 'model_unavailable' | 'too_many_request';

export interface AgentPlaygroundModelUnavailableError {
    error: { code: 'model_unavailable'; retryable: boolean };
}

export type PostAgentPlaygroundChat = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'TODO: audit coverage pending' };
    Method: 'POST';
    Path: '/api/v1/agent-playground/chat';
    Querystring: { env: string };
    Body: {
        sessionId?: string | undefined;
        messages: unknown[];
        timeZone?: string | undefined;
    };
    Success: Record<string, unknown>;
    Error: ApiError<AgentPlaygroundErrorCode>;
}>;
