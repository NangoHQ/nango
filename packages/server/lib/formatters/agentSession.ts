import type { EndedSession } from '../services/agentSession.service.js';
import type { ApiTerminatedAgentSession } from '@nangohq/types';

export function terminatedAgentSessionToPublicApi(session: EndedSession): ApiTerminatedAgentSession {
    return {
        session_id: session.id,
        ended_at: session.endedAt.toISOString(),
        reason: session.endedReason
    };
}
