/** One model per session, so ending a session deletes everything it stored with one delete by model per connection. */
export function agentSessionResultModel(sessionId: string): string {
    return `_nango_agent_session_${sessionId}`;
}
