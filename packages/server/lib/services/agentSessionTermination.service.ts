import db from '@nangohq/database';
import { logContextGetter } from '@nangohq/logs';
import { Err, Ok, report } from '@nangohq/utils';

import * as agentSessionService from './agentSession.service.js';

import type { AgentSessionEndedReason, AuditActor, DBEnvironment, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export type AgentSessionTerminationErrorCode = 'not_found' | 'server_error';

export class AgentSessionTerminationError extends Error {
    public readonly code: AgentSessionTerminationErrorCode;

    constructor({ code, message, cause }: { code: AgentSessionTerminationErrorCode; message: string; cause?: unknown }) {
        super(message, { cause });
        this.name = 'AgentSessionTerminationError';
        this.code = code;
    }
}

export interface TerminateAgentSessionParams {
    account: DBTeam;
    environment: DBEnvironment;
    sessionId: string;
    endedBy: AuditActor;
}

export interface TerminatedAgentSession {
    sessionId: string;
    endedAt: Date;
    reason: AgentSessionEndedReason;
}

/**
 * Terminating is idempotent: a session that was already ended keeps its original ended_at and does
 * not get a second terminated operation.
 */
export async function terminateAgentSession(params: TerminateAgentSessionParams): Promise<Result<TerminatedAgentSession, AgentSessionTerminationError>> {
    const { account, environment, sessionId, endedBy } = params;

    const terminated = await agentSessionService.terminateAgentSession(db.knex, {
        id: sessionId,
        accountId: account.id,
        environmentId: environment.id,
        reason: 'terminated'
    });
    if (terminated.isErr()) {
        if (terminated.error.code === 'not_found') {
            return Err(new AgentSessionTerminationError({ code: 'not_found', message: `Agent session '${sessionId}' not found` }));
        }

        report(terminated.error);
        return Err(new AgentSessionTerminationError({ code: 'server_error', message: 'Failed to terminate the agent session', cause: terminated.error }));
    }

    const { session, alreadyEnded } = terminated.value;
    if (session.endedAt === null || session.endedReason === null) {
        const err = new Error(`Agent session '${sessionId}' has no end state after being terminated`);
        report(err);
        return Err(new AgentSessionTerminationError({ code: 'server_error', message: 'Failed to terminate the agent session', cause: err }));
    }

    if (!alreadyEnded) {
        await recordTermination({ account, environment, sessionId: session.id, endedAt: session.endedAt, endedBy });
    }

    return Ok({ sessionId: session.id, endedAt: session.endedAt, reason: session.endedReason });
}

async function recordTermination({
    account,
    environment,
    sessionId,
    endedAt,
    endedBy
}: {
    account: DBTeam;
    environment: DBEnvironment;
    sessionId: string;
    endedAt: Date;
    endedBy: AuditActor;
}): Promise<void> {
    const logCtx = await logContextGetter.create(
        { operation: { type: 'agent_session', action: 'terminate' } },
        {
            account,
            environment,
            meta: { endedBy, endedAt: endedAt.toISOString() }
        }
    );

    await logCtx.enrichOperation({ actor: { kind: 'session', id: sessionId } });
    void logCtx.info('Agent session terminated');
    await logCtx.success();
}
