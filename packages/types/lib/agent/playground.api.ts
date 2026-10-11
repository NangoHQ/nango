import type { ApiEndpoint, ApiError } from '../api.js';

export interface AgentPlaygroundUsage {
    inputTokens: number;
    outputTokens: number;
}

export interface AgentPlaygroundIntegrationSetup {
    provider: string;
    integrationId?: string;
    outcome: 'created' | 'existing' | 'missing_credentials' | 'not_created';
}

export interface AgentPlaygroundMessageMetadata {
    sessionId?: string;
    sessionExpiresAt?: string;
    hidden?: boolean;
    connectedIntegrations?: string[];
    starterProvider?: string;
    integrationSetup?: AgentPlaygroundIntegrationSetup;
    usage?: AgentPlaygroundUsage;
}

export type AgentPlaygroundErrorCode = 'feature_disabled' | 'session_creation_failed' | 'model_error';

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
