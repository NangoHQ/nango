import type { ApiError, Endpoint } from '../api.js';

export type PostAgentSessionStart = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/agent/session/start';
    Body: {
        prompt: string;
        integration_id: string;
        connection_id?: string | undefined;
    };
    Error: ApiError<'invalid_request'> | ApiError<'server_error'>;
    Success: {
        session_token: string;
        execution_timeout_at: string;
    };
}>;

export type GetAgentSessionEvents = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/agent/session/:sessionToken/events';
    Params: { sessionToken: string };
    Error: ApiError<'not_found'> | ApiError<'server_error'>;
    // SSE streams events indefinitely; no structured JSON success body
    Success: never;
}>;

export type PostAgentSessionAnswer = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/agent/session/:sessionToken/answer';
    Params: { sessionToken: string };
    Body: {
        question_id: string;
        /** For regular questions: any string. For permissions: "once" | "always" | "reject" */
        response: string;
    };
    Error: ApiError<'invalid_request'> | ApiError<'not_found'> | ApiError<'server_error'>;
    Success: {
        success: true;
        accepted_at: string;
    };
}>;

export interface AgentEventProgress {
    type: 'progress';
    message: string;
}

export interface AgentEventSession {
    type: 'session';
    session_id: string;
}

export interface AgentEventDone {
    type: 'done';
    message: string;
}

export interface AgentEventDebug {
    type: 'debug';
    message: string;
}

export interface AgentEventQuestion {
    type: 'question';
    question_id: string;
    message: string;
}

export interface AgentEventError {
    type: 'error';
    message: string;
}

export type AgentEventData = AgentEventProgress | AgentEventSession | AgentEventDone | AgentEventDebug | AgentEventQuestion | AgentEventError;

export type AgentEventName =
    | 'agent.lifecycle'
    | 'agent.session.started'
    | 'agent.delta'
    | 'agent.tool.updated'
    | 'agent.message.updated'
    | 'agent.question'
    | 'agent.permission.requested'
    | 'agent.session.idle'
    | 'agent.error';

export interface AgentSseEvent {
    event: AgentEventName;
    data: AgentEventData;
}
