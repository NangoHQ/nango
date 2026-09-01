import * as keystore from '@nangohq/keystore';
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

export interface TerminatedAgentSession {
    session: AgentSession;
    alreadyEnded: boolean;
}

type AgentSessionErrorCode = 'not_found' | 'creation_failed' | 'termination_failed' | 'token_creation_failed';

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

/**
 * Ending the session and revoking its token share a transaction: a session that is ended while its
 * token survives is still a usable credential.
 */
export async function terminateAgentSession(
    db: Knex,
    { id, accountId, environmentId, reason }: { id: string; accountId: number; environmentId: number; reason: AgentSessionEndedReason }
): Promise<Result<TerminatedAgentSession, AgentSessionError>> {
    try {
        return await db.transaction(async (trx) => {
            const [terminated] = await trx<DBAgentSession>(AGENT_SESSIONS_TABLE)
                .where({ id, account_id: accountId, environment_id: environmentId })
                .whereNull('ended_at')
                .update({ ended_at: trx.fn.now(), ended_reason: reason, updated_at: trx.fn.now() })
                .returning('*');

            const session: Result<AgentSession, AgentSessionError> = terminated
                ? Ok(toAgentSession(terminated))
                : await getAgentSession(trx, { id, accountId, environmentId });
            if (session.isErr()) {
                return Err(session.error);
            }

            // Also on a repeat: a session ended by another path may still have its token.
            await keystore.deletePrivateKeysByEntityUuid(trx, { entityType: 'agent_session', entityUuid: session.value.id });

            return Ok({ session: session.value, alreadyEnded: !terminated });
        });
    } catch (err) {
        return Err(terminationFailedError({ id, accountId, environmentId }, err));
    }
}

// Agent session tokens are minted through the keystore for now. Once the unified authz project
// lands (RFC: user-level grants and unified authz) they become customer keys with grants scoped
// to the environment and session, so every mint and resolve detail must stay behind
// createAgentSessionToken and getAgentSessionByToken to keep that switch local.
export async function createAgentSessionToken(db: Knex, session: AgentSession): Promise<Result<{ token: string; expiresAt: Date }, AgentSessionError>> {
    const ttlInMs = session.expiresAt.getTime() - Date.now();
    if (ttlInMs <= 0) {
        return Err(
            new AgentSessionError({
                code: 'token_creation_failed',
                message: 'Agent session is already expired',
                payload: { id: session.id }
            })
        );
    }

    try {
        // The token is handed out once at creation, so only its hash is stored.
        const privateKey = await keystore.createPrivateKey(
            db,
            {
                displayName: '',
                accountId: session.accountId,
                environmentId: session.environmentId,
                entityType: 'agent_session',
                entityUuid: session.id,
                ttlInMs
            },
            { onlyStoreHash: true }
        );
        if (privateKey.isErr()) {
            return Err(tokenCreationFailedError(session.id, privateKey.error));
        }

        const [token, storedKey] = privateKey.value;
        if (!storedKey.expiresAt) {
            return Err(tokenCreationFailedError(session.id));
        }

        return Ok({ token, expiresAt: storedKey.expiresAt });
    } catch (err) {
        return Err(tokenCreationFailedError(session.id, err));
    }
}

export async function getAgentSessionByToken(db: Knex, token: string): Promise<Result<AgentSession, AgentSessionError>> {
    const privateKey = await keystore.getPrivateKey(db, token);
    if (privateKey.isErr()) {
        return Err(tokenNotFoundError(token));
    }

    const key = privateKey.value;
    if (key.entityType !== 'agent_session' || key.entityUuid === null) {
        return Err(tokenNotFoundError(token));
    }

    return getAgentSession(db, { id: key.entityUuid, accountId: key.accountId, environmentId: key.environmentId });
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

function terminationFailedError({ id, accountId, environmentId }: { id: string; accountId: number; environmentId: number }, cause: unknown): AgentSessionError {
    return new AgentSessionError({
        code: 'termination_failed',
        message: `Failed to terminate agent session '${id}'`,
        payload: { id, accountId, environmentId },
        cause
    });
}

function tokenCreationFailedError(sessionId: string, cause?: unknown): AgentSessionError {
    return new AgentSessionError({
        code: 'token_creation_failed',
        message: 'Failed to create agent session token',
        payload: { id: sessionId },
        cause
    });
}

function tokenNotFoundError(token: string): AgentSessionError {
    return new AgentSessionError({
        code: 'not_found',
        message: 'Token not found',
        payload: { token: `${token.substring(0, 32)}...` }
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
