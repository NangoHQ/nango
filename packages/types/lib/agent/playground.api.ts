import type { ApiEndpoint, ApiError } from '../api.js';

export interface AgentPlaygroundToolCall {
    id: string;
    name: string;
    input: unknown;
    output: unknown;
    isError: boolean;
    durationMs: number;
}

export interface AgentPlaygroundUsage {
    inputTokens: number;
    outputTokens: number;
    cachedModelCalls: number;
    modelCalls: number;
}

export type AgentPlaygroundErrorCode = 'feature_disabled' | 'session_not_found' | 'session_creation_failed' | 'model_error';

export type PostAgentPlaygroundChat = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'TODO: audit coverage pending' };
    Method: 'POST';
    Path: '/api/v1/agent-playground/chat';
    Querystring: { env: string };
    Body: {
        sessionId?: string | undefined;
        messages: unknown[];
        prompt: string;
        timeZone?: string | undefined;
    };
    Success: {
        data: {
            sessionId: string;
            /** Already includes the prompt: append as-is, don't add the prompt again. */
            messages: unknown[];
            reply: string;
            toolCalls: AgentPlaygroundToolCall[];
            usage: AgentPlaygroundUsage;
        };
    };
    Error: ApiError<AgentPlaygroundErrorCode>;
}>;
