export const AGENT_SESSION_RESULT_MODEL_PREFIX = '_nango_agent_session_';

/** One model per session, so ending a session deletes everything it stored with one delete by model per connection. */
export function agentSessionResultModel(sessionId: string): string {
    return `${AGENT_SESSION_RESULT_MODEL_PREFIX}${sessionId}`;
}

export function isAgentSessionResultModel(model: string): boolean {
    return model.startsWith(AGENT_SESSION_RESULT_MODEL_PREFIX);
}
