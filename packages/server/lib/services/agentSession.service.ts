import { Err, Ok } from '@nangohq/utils';

import type { Knex } from '@nangohq/database';
import type {
    AgentSession,
    AgentSessionCompiledToolset,
    AgentSessionEndedReason,
    AgentSessionMetaTools,
    AgentSessionResolvedConnections,
    DBEnvironment
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const AGENT_SESSIONS_TABLE = 'agent_sessions';
const ENVIRONMENTS_TABLE = '_nango_environments';

export interface DBAgentSession {
    readonly id: string;
    readonly environment_id: number;
    readonly account_id: number;
    readonly resolved_connections: AgentSessionResolvedConnections;
    readonly compiled_toolset: AgentSessionCompiledToolset;
    readonly meta_tools: AgentSessionMetaTools;
    readonly expires_at: Date;
    readonly ended_at: Date | null;
    readonly ended_reason: AgentSessionEndedReason | null;
    readonly created_at: Date;
    readonly updated_at: Date;
}

export interface CreateAgentSessionParams {
    accountId: number;
    environmentId: number;
    resolvedConnections: AgentSessionResolvedConnections;
    compiledToolset: AgentSessionCompiledToolset;
    metaTools: AgentSessionMetaTools;
    expiresAt: Date;
}

export type ExpiredAgentSession = Pick<AgentSession, 'id' | 'accountId' | 'environmentId' | 'expiresAt'>;

type AgentSessionErrorCode = 'not_found' | 'creation_failed';

export class AgentSessionError extends Error {
    public readonly code: AgentSessionErrorCode;
    public readonly payload: Record<string, unknown>;

    constructor({ code, message, payload, cause }: { code: AgentSessionErrorCode; message: string; payload?: Record<string, unknown>; cause?: unknown }) {
        super(message, { cause });
        this.name = 'AgentSessionError';
        this.code = code;
        this.payload = payload ?? {};
    }
}

export async function createAgentSession(db: Knex, params: CreateAgentSessionParams): Promise<Result<AgentSession, AgentSessionError>> {
    try {
        const environment = await db<Pick<DBEnvironment, 'id' | 'account_id' | 'deleted'>>(ENVIRONMENTS_TABLE)
            .select('id')
            .where({ id: params.environmentId, account_id: params.accountId, deleted: false })
            .first();
        if (!environment) {
            return Err(creationFailedError(params));
        }

        const [session] = await db<DBAgentSession>(AGENT_SESSIONS_TABLE)
            .insert({
                account_id: params.accountId,
                environment_id: params.environmentId,
                resolved_connections: jsonb(db, params.resolvedConnections),
                compiled_toolset: jsonb(db, params.compiledToolset),
                meta_tools: jsonb(db, params.metaTools),
                expires_at: params.expiresAt
            })
            .returning('*');

        if (!session) {
            throw new Error('Agent session insert returned no row');
        }

        return Ok(toAgentSession(session));
    } catch (err) {
        return Err(creationFailedError(params, err));
    }
}

export async function getAgentSession(
    db: Knex,
    { id, accountId, environmentId }: { id: string; accountId: number; environmentId: number }
): Promise<Result<AgentSession, AgentSessionError>> {
    const session = await db<DBAgentSession>(AGENT_SESSIONS_TABLE).where({ id, account_id: accountId, environment_id: environmentId }).first();

    if (!session) {
        return Err(notFoundError({ id, accountId, environmentId }));
    }

    return Ok(toAgentSession(session));
}

export async function terminateAgentSession(
    db: Knex,
    { id, accountId, environmentId, reason }: { id: string; accountId: number; environmentId: number; reason: AgentSessionEndedReason }
): Promise<Result<AgentSession, AgentSessionError>> {
    const [session] = await db<DBAgentSession>(AGENT_SESSIONS_TABLE)
        .where({ id, account_id: accountId, environment_id: environmentId })
        .whereNull('ended_at')
        .update({ ended_at: db.fn.now(), ended_reason: reason, updated_at: db.fn.now() })
        .returning('*');

    if (session) {
        return Ok(toAgentSession(session));
    }

    return getAgentSession(db, { id, accountId, environmentId });
}

export async function listExpiredAgentSessions(db: Knex, { limit }: { limit: number }): Promise<ExpiredAgentSession[]> {
    const sessions = await db<DBAgentSession>(AGENT_SESSIONS_TABLE)
        .select('id', 'account_id', 'environment_id', 'expires_at')
        .whereNull('ended_at')
        .where('expires_at', '<=', db.fn.now())
        .orderBy('expires_at', 'asc')
        .limit(limit);

    return sessions.map((session) => ({
        id: session.id,
        accountId: session.account_id,
        environmentId: session.environment_id,
        expiresAt: session.expires_at
    }));
}

function jsonb(db: Knex, value: object): Knex.Raw {
    return db.raw('?::jsonb', [JSON.stringify(value)]);
}

function notFoundError({ id, accountId, environmentId }: { id: string; accountId: number; environmentId: number }): AgentSessionError {
    return new AgentSessionError({
        code: 'not_found',
        message: `Agent session '${id}' not found`,
        payload: { id, accountId, environmentId }
    });
}

function creationFailedError(params: CreateAgentSessionParams, cause?: unknown): AgentSessionError {
    return new AgentSessionError({
        code: 'creation_failed',
        message: 'Failed to create agent session',
        payload: { accountId: params.accountId, environmentId: params.environmentId },
        cause
    });
}

function toAgentSession(session: DBAgentSession): AgentSession {
    return {
        id: session.id,
        environmentId: session.environment_id,
        accountId: session.account_id,
        resolvedConnections: session.resolved_connections,
        compiledToolset: session.compiled_toolset,
        metaTools: session.meta_tools,
        expiresAt: session.expires_at,
        endedAt: session.ended_at,
        endedReason: session.ended_reason,
        createdAt: session.created_at,
        updatedAt: session.updated_at
    };
}
