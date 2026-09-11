import { makeAuditTarget as makeTarget } from '../../audit.js';
import { Audit, auditable } from './auditable.js';
import { omitUndefined, param, uuid } from './input.js';

import type { DeleteAgentSession, PostAgentSessions } from '@nangohq/types';

export const auditAgentSessionCreated = auditable<PostAgentSessions>({
    policy: Audit.auditable({ resource: 'agent_session', action: 'created', scope: 'environment' }),
    // Never read the token from the response — only the session id identifies the session.
    targetFromResponse: (response) => makeTarget('agent_session', response.data.session_id),
    metadataFromResponse: (response) => omitUndefined({ expiresAt: response.data.expires_at })
});

export const auditAgentSessionTerminated = auditable<DeleteAgentSession>({
    policy: Audit.auditable({ resource: 'agent_session', action: 'terminated', scope: 'environment' }),
    target: (req) => makeTarget('agent_session', uuid(param(req, 'sessionId')))
});
