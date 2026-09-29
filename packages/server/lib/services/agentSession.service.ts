import { z } from 'zod';

import db from '@nangohq/database';
import * as keystore from '@nangohq/keystore';
import { logContextGetter } from '@nangohq/logs';
import { connectionTagsSchema, TAG_MAX_COUNT } from '@nangohq/shared';
import { baseUrl, Err, Ok, report } from '@nangohq/utils';

import * as agentSessionConnectionsService from './agentSessionConnections.service.js';
import * as agentSessionToolsetService from './agentSessionToolset.service.js';

import type { Knex } from '@nangohq/database';
import type { LogContextOrigin } from '@nangohq/logs';
import type {
    AgentSession,
    AgentSessionCompiledToolset,
    AgentSessionCreateConnectionConfig,
    AgentSessionCreationErrorCode,
    AgentSessionEndedReason,
    AgentSessionMetaTools,
    AgentSessionMetaToolsSummary,
    AgentSessionPinnedTools,
    AgentSessionResolvedConnection,
    AgentSessionResolvedConnections,
    AgentSessionResolvedConnectionSummary,
    AgentSessionTenantConnections,
    AgentSessionToolNames,
    AgentSessionToolsetPolicy,
    DBEnvironment,
    DBTeam
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const AGENT_SESSIONS_TABLE = 'agent_sessions';
const ENVIRONMENTS_TABLE = '_nango_environments';

const MIN_EXPIRES_IN_MS = 60 * 1000;
const MAX_EXPIRES_IN_MS = 15 * 24 * 60 * 60 * 1000;
const DEFAULT_EXPIRES_IN_MS = MAX_EXPIRES_IN_MS;

const EXPIRES_IN_PATTERN = /^([1-9]\d*)([smhd])$/;

const EXPIRES_IN_UNITS_IN_MS: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
};

/** One slot is spent on the tag binding the connection back to the session, so the caller gets the rest. */
const MAX_CONFIGURED_TAGS = TAG_MAX_COUNT - 1;

export const DEFAULT_CREATE_CONNECTION_CONFIG: AgentSessionCreateConnectionConfig = { enabled: false, tags: {} };

const asMetaToolConfig = (value: unknown) => (typeof value === 'boolean' ? { enabled: value } : value);

const metaToolSchema = z.preprocess(asMetaToolConfig, z.strictObject({ enabled: z.boolean() }));

const createConnectionMetaToolSchema = z.preprocess(
    asMetaToolConfig,
    z.strictObject({
        enabled: z.boolean(),
        tags: connectionTagsSchema
            .refine((tags) => Object.keys(tags).length <= MAX_CONFIGURED_TAGS, {
                message: `Cannot configure more than ${MAX_CONFIGURED_TAGS} tags`
            })
            .optional()
    })
);

const META_TOOLS = {
    nangoToolSearch: { name: 'nango_tool_search', enabledByDefault: true, schema: metaToolSchema },
    nangoExecute: { name: 'nango_execute', enabledByDefault: true, schema: metaToolSchema },
    // Off by default: it reaches any endpoint of a connected integration, not only the toolset's tools.
    nangoProxy: { name: 'nango_proxy', enabledByDefault: false, schema: metaToolSchema },
    nangoCreateConnection: { name: 'nango_create_connection', enabledByDefault: false, schema: createConnectionMetaToolSchema }
} as const satisfies Record<keyof AgentSessionMetaTools, { name: keyof AgentSessionMetaToolsSummary; enabledByDefault: boolean; schema: z.ZodType }>;

const META_TOOL_NAMES: string[] = Object.values(META_TOOLS).map((metaTool) => metaTool.name);

export const agentSessionMetaToolsSchema = z.looseObject({
    nango_tool_search: META_TOOLS.nangoToolSearch.schema.optional(),
    nango_execute: META_TOOLS.nangoExecute.schema.optional(),
    nango_proxy: META_TOOLS.nangoProxy.schema.optional(),
    nango_create_connection: META_TOOLS.nangoCreateConnection.schema.optional()
} satisfies Record<keyof AgentSessionMetaToolsSummary, z.ZodType>);

export type AgentSessionMetaToolsRequest = z.output<typeof agentSessionMetaToolsSchema>;

export const agentSessionExpiresInSchema = z
    .string()
    .transform((value, ctx) => {
        const ms = expiresInToMs(value);
        if (ms === null) {
            ctx.addIssue({ code: 'custom', message: 'expires_in must be a positive integer followed by s, m, h or d, for example 1h' });
            return z.NEVER;
        }

        return ms;
    })
    .refine((ms) => ms >= MIN_EXPIRES_IN_MS, { message: 'expires_in cannot be shorter than 60s' })
    .refine((ms) => ms <= MAX_EXPIRES_IN_MS, { message: 'expires_in cannot exceed 15d' });

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
    account: DBTeam;
    environment: DBEnvironment;
    connections: AgentSessionTenantConnections;
    toolset: AgentSessionToolsetPolicy | undefined;
    pinnedTools: AgentSessionPinnedTools | undefined;
    metaTools: AgentSessionMetaToolsRequest | undefined;
    expiresInMs: number | undefined;
}

export interface CreatedAgentSession {
    session: AgentSession;
    token: string;
    mcpUrl: string;
}

export interface InsertAgentSessionParams {
    accountId: number;
    environmentId: number;
    resolvedConnections: AgentSessionResolvedConnections;
    compiledToolset: AgentSessionCompiledToolset;
    metaTools: AgentSessionMetaTools;
    expiresAt: Date;
}

export type ExpiredAgentSession = Pick<AgentSession, 'id' | 'accountId' | 'environmentId' | 'expiresAt'>;

export type EndedSession = AgentSession & { endedAt: Date; endedReason: AgentSessionEndedReason };

export interface EndedAgentSession {
    session: EndedSession;
    alreadyEnded: boolean;
}

export interface TerminateAgentSessionParams {
    account: DBTeam;
    environment: DBEnvironment;
    sessionId: string;
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

export type AgentSessionCreationFailureCode = AgentSessionCreationErrorCode | 'server_error';

export class AgentSessionCreationError extends Error {
    public readonly code: AgentSessionCreationFailureCode;
    public readonly payload: Record<string, unknown>;

    constructor({
        code,
        message,
        payload,
        cause
    }: {
        code: AgentSessionCreationFailureCode;
        message: string;
        payload?: Record<string, unknown>;
        cause?: unknown;
    }) {
        super(message, { cause });
        this.name = 'AgentSessionCreationError';
        this.code = code;
        this.payload = payload ?? {};
    }
}

export type AgentSessionTerminationErrorCode = 'not_found' | 'server_error';

export class AgentSessionTerminationError extends Error {
    public readonly code: AgentSessionTerminationErrorCode;

    constructor({ code, message, cause }: { code: AgentSessionTerminationErrorCode; message: string; cause?: unknown }) {
        super(message, { cause });
        this.name = 'AgentSessionTerminationError';
        this.code = code;
    }
}

/**
 * Every entry point that creates a session goes through here, so the session created operation and
 * the creation error codes stay in one place.
 */
export async function createAgentSession(params: CreateAgentSessionParams): Promise<Result<CreatedAgentSession, AgentSessionCreationError>> {
    const { account, environment } = params;
    const logCtx = await logContextGetter.create(
        { operation: { type: 'agent_session', action: 'create' } },
        { account, environment, meta: { requested: requestedConfig(params) } }
    );

    try {
        const created = await runCreation(params, logCtx);
        if (created.isErr()) {
            void logCtx.error(created.error.message, { code: created.error.code, payload: created.error.payload });
            await logCtx.failed();
            return Err(withoutCandidateTags(created.error));
        }

        await logCtx.enrichOperation({
            actor: { kind: 'session', id: created.value.session.id },
            meta: {
                requested: requestedConfig(params),
                resolvedConnections: resolvedConnectionsSummary(created.value.session.resolvedConnections),
                toolset: toolsetToolNames(created.value.session.compiledToolset),
                metaTools: created.value.session.metaTools,
                expiresAt: created.value.session.expiresAt.toISOString()
            }
        });
        void logCtx.info('Agent session created');
        await logCtx.success();

        return created;
    } catch (err) {
        void logCtx.error('Failed to create the agent session', { error: err });
        await logCtx.failed();
        throw err;
    }
}

/**
 * Every entry point that terminates a session on a caller's behalf goes through here, so the session
 * terminated operation and the termination error codes stay in one place.
 *
 * Terminating is idempotent: a session that was already ended keeps its original ended_at and does
 * not get a second terminated operation.
 */
export async function terminateAgentSession(params: TerminateAgentSessionParams): Promise<Result<EndedAgentSession, AgentSessionTerminationError>> {
    const { account, environment, sessionId } = params;

    const ended = await endAgentSession(db.knex, {
        id: sessionId,
        accountId: account.id,
        environmentId: environment.id,
        reason: 'terminated'
    });
    if (ended.isErr()) {
        if (ended.error.code === 'not_found') {
            return Err(new AgentSessionTerminationError({ code: 'not_found', message: `Agent session '${sessionId}' not found` }));
        }

        report(ended.error);
        return Err(new AgentSessionTerminationError({ code: 'server_error', message: 'Failed to terminate the agent session', cause: ended.error }));
    }

    const { session, alreadyEnded } = ended.value;
    if (!alreadyEnded) {
        const logCtx = await logContextGetter.create({ operation: { type: 'agent_session', action: 'terminate' } }, { account, environment });

        await logCtx.enrichOperation({ actor: { kind: 'session', id: session.id } });
        void logCtx.info('Agent session terminated');
        await logCtx.success();
    }

    return Ok(ended.value);
}

export async function insertAgentSession(trx: Knex, params: InsertAgentSessionParams): Promise<Result<AgentSession, AgentSessionError>> {
    try {
        const environment = await trx<Pick<DBEnvironment, 'id' | 'account_id' | 'deleted'>>(ENVIRONMENTS_TABLE)
            .select('id')
            .where({ id: params.environmentId, account_id: params.accountId, deleted: false })
            .first();
        if (!environment) {
            return Err(creationFailedError(params));
        }

        const [session] = await trx<DBAgentSession>(AGENT_SESSIONS_TABLE)
            .insert({
                account_id: params.accountId,
                environment_id: params.environmentId,
                resolved_connections: jsonb(trx, params.resolvedConnections),
                compiled_toolset: jsonb(trx, params.compiledToolset),
                meta_tools: jsonb(trx, params.metaTools),
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
    trx: Knex,
    { id, accountId, environmentId }: { id: string; accountId: number; environmentId: number }
): Promise<Result<AgentSession, AgentSessionError>> {
    const session = await trx<DBAgentSession>(AGENT_SESSIONS_TABLE).where({ id, account_id: accountId, environment_id: environmentId }).first();

    if (!session) {
        return Err(notFoundError({ id, accountId, environmentId }));
    }

    return Ok(toAgentSession(session));
}

export async function endAgentSession(
    trx: Knex,
    { id, accountId, environmentId, reason }: { id: string; accountId: number; environmentId: number; reason: AgentSessionEndedReason }
): Promise<Result<EndedAgentSession, AgentSessionError>> {
    try {
        return await trx.transaction(async (innerTrx) => {
            const [terminated] = await innerTrx<DBAgentSession>(AGENT_SESSIONS_TABLE)
                .where({ id, account_id: accountId, environment_id: environmentId })
                .whereNull('ended_at')
                .update({ ended_at: innerTrx.fn.now(), ended_reason: reason, updated_at: innerTrx.fn.now() })
                .returning('*');

            const session: Result<AgentSession, AgentSessionError> = terminated
                ? Ok(toAgentSession(terminated))
                : await getAgentSession(innerTrx, { id, accountId, environmentId });
            if (session.isErr()) {
                return Err(session.error);
            }

            const { endedAt, endedReason } = session.value;
            if (endedAt === null || endedReason === null) {
                throw new Error(`Agent session '${id}' has no end state after being ended`);
            }

            await keystore.deletePrivateKeysByEntityUuid(innerTrx, { entityType: 'agent_session', entityUuid: session.value.id });

            return Ok({ session: { ...session.value, endedAt, endedReason }, alreadyEnded: !terminated });
        });
    } catch (err) {
        return Err(terminationFailedError({ id, accountId, environmentId }, err));
    }
}

// Agent session tokens are minted through the keystore for now. Once the unified authz project
// lands (RFC: user-level grants and unified authz) they become customer keys with grants scoped
// to the environment and session, so every mint and resolve detail must stay behind
// createAgentSessionToken and getAgentSessionByToken to keep that switch local.
export async function createAgentSessionToken(trx: Knex, session: AgentSession): Promise<Result<{ token: string; expiresAt: Date }, AgentSessionError>> {
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
            trx,
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

export async function getAgentSessionByToken(trx: Knex, token: string): Promise<Result<AgentSession, AgentSessionError>> {
    const privateKey = await keystore.getPrivateKey(trx, token);
    if (privateKey.isErr()) {
        return Err(tokenNotFoundError(token));
    }

    const key = privateKey.value;
    if (key.entityType !== 'agent_session' || key.entityUuid === null) {
        return Err(tokenNotFoundError(token));
    }

    return getAgentSession(trx, { id: key.entityUuid, accountId: key.accountId, environmentId: key.environmentId });
}

/**
 * Binds a connection the agent created to the integration slot it was created for. The slot has to
 * still be empty.
 */
export async function fillResolvedConnection(
    trx: Knex,
    { id, integrationId, connection }: { id: string; integrationId: string; connection: AgentSessionResolvedConnection }
): Promise<Result<AgentSession, AgentSessionError>> {
    try {
        const [session] = await trx<DBAgentSession>(AGENT_SESSIONS_TABLE)
            .where({ id })
            .whereRaw('resolved_connections -> ? IS NULL', [integrationId])
            .update({
                resolved_connections: trx.raw('resolved_connections || ?::jsonb', [JSON.stringify({ [integrationId]: connection })]),
                updated_at: new Date()
            })
            .returning('*');

        // Lost the race against a concurrent fill, so the row now holds a connection either way.
        if (!session) {
            return await getAgentSessionById(trx, id);
        }

        return Ok(toAgentSession(session));
    } catch (err) {
        return Err(
            new AgentSessionError({
                code: 'creation_failed',
                message: 'Failed to attach the connection to the agent session',
                payload: { sessionId: id, integrationId },
                cause: err
            })
        );
    }
}

export async function listExpiredAgentSessions(trx: Knex, { limit }: { limit: number }): Promise<ExpiredAgentSession[]> {
    const sessions = await trx<DBAgentSession>(AGENT_SESSIONS_TABLE)
        .select('id', 'account_id', 'environment_id', 'expires_at')
        .whereNull('ended_at')
        .where('expires_at', '<=', trx.fn.now())
        .orderBy('expires_at', 'asc')
        .limit(limit);

    return sessions.map((session) => ({
        id: session.id,
        accountId: session.account_id,
        environmentId: session.environment_id,
        expiresAt: session.expires_at
    }));
}

export async function expireAgentSessions(trx: Knex, { limit }: { limit: number }): Promise<number> {
    const sessions = await listExpiredAgentSessions(trx, { limit });

    let expired = 0;
    for (const session of sessions) {
        const ended = await endAgentSession(trx, {
            id: session.id,
            accountId: session.accountId,
            environmentId: session.environmentId,
            reason: 'expired'
        });
        if (ended.isErr()) {
            report(ended.error);
            continue;
        }

        expired++;
    }

    return expired;
}

export function expiresInToMs(expiresIn: string): number | null {
    const match = EXPIRES_IN_PATTERN.exec(expiresIn);
    if (!match) {
        return null;
    }

    const [, amount, unit] = match;
    const unitInMs = unit ? EXPIRES_IN_UNITS_IN_MS[unit] : undefined;

    return unitInMs ? Number(amount) * unitInMs : null;
}

export function parseMetaTools(requested: AgentSessionMetaToolsRequest | undefined): { applied: AgentSessionMetaTools; unknown: string[] } {
    const unknown = Object.keys(requested ?? {}).filter((key) => !META_TOOL_NAMES.includes(key));

    return {
        applied: {
            nangoToolSearch: requested?.nango_tool_search?.enabled ?? META_TOOLS.nangoToolSearch.enabledByDefault,
            nangoExecute: requested?.nango_execute?.enabled ?? META_TOOLS.nangoExecute.enabledByDefault,
            nangoProxy: requested?.nango_proxy?.enabled ?? META_TOOLS.nangoProxy.enabledByDefault,
            nangoCreateConnection: parseCreateConnection(requested?.nango_create_connection)
        },
        unknown
    };
}

export function parseCreateConnection(requested: AgentSessionMetaToolsRequest['nango_create_connection']): AgentSessionCreateConnectionConfig {
    if (requested === undefined) {
        return { enabled: META_TOOLS.nangoCreateConnection.enabledByDefault, tags: {} };
    }

    return { enabled: requested.enabled, tags: requested.tags ?? {} };
}

export function resolvedConnectionsSummary(connections: AgentSessionResolvedConnections): Record<string, AgentSessionResolvedConnectionSummary> {
    return Object.fromEntries(
        Object.entries(connections).map(([integrationId, connection]) => [
            integrationId,
            { integrationId: connection.integrationId, provider: connection.provider, connectionId: connection.connectionId }
        ])
    );
}

export function toolsetToolNames(toolset: AgentSessionCompiledToolset): Record<string, AgentSessionToolNames> {
    return Object.fromEntries(
        Object.entries(toolset).map(([integrationId, integration]) => [
            integrationId,
            {
                provider: integration.provider,
                pinned: integration.pinned.map((tool) => tool.name),
                searchable: integration.searchable.map((tool) => tool.name)
            }
        ])
    );
}

async function runCreation(params: CreateAgentSessionParams, logCtx: LogContextOrigin): Promise<Result<CreatedAgentSession, AgentSessionCreationError>> {
    const { account, environment } = params;

    const metaTools = parseMetaTools(params.metaTools);
    if (metaTools.unknown.length > 0) {
        return Err(
            new AgentSessionCreationError({
                code: 'unknown_meta_tool',
                message: `${metaTools.unknown.length} ${metaTools.unknown.length === 1 ? 'key is' : 'keys are'} not a meta tool Nango ships. Supported meta tools are ${META_TOOL_NAMES.join(', ')}.`,
                payload: { meta_tools: metaTools.unknown }
            })
        );
    }

    const resolvedConnections = await agentSessionConnectionsService.resolveTenantConnections({
        environmentId: environment.id,
        connections: params.connections
    });
    if (resolvedConnections.isErr()) {
        return Err(rejected(resolvedConnections.error));
    }

    const compiledToolset = await agentSessionToolsetService.compileToolset({
        environmentId: environment.id,
        toolset: params.toolset,
        pinnedTools: params.pinnedTools,
        connectedIntegrations: Object.keys(resolvedConnections.value)
    });
    if (compiledToolset.isErr()) {
        return Err(rejected(compiledToolset.error));
    }

    const session = await insertAgentSession(db.knex, {
        accountId: account.id,
        environmentId: environment.id,
        resolvedConnections: resolvedConnections.value,
        compiledToolset: compiledToolset.value,
        metaTools: metaTools.applied,
        expiresAt: new Date(Date.now() + (params.expiresInMs ?? DEFAULT_EXPIRES_IN_MS))
    });
    if (session.isErr()) {
        report(session.error);
        return Err(new AgentSessionCreationError({ code: 'server_error', message: 'Failed to create agent session', cause: session.error }));
    }

    const token = await createAgentSessionToken(db.knex, session.value);
    if (token.isErr()) {
        // A session no token can reach is unusable, so it is ended rather than left to expire.
        const ended = await endAgentSession(db.knex, {
            id: session.value.id,
            accountId: account.id,
            environmentId: environment.id,
            reason: 'terminated'
        });
        if (ended.isErr()) {
            void logCtx.error('Failed to end the agent session left behind by the token failure', { error: ended.error, sessionId: session.value.id });
        }

        report(token.error);
        return Err(new AgentSessionCreationError({ code: 'server_error', message: 'Failed to create agent session token', cause: token.error }));
    }

    return Ok({
        session: session.value,
        token: token.value.token,
        mcpUrl: `${baseUrl}/session/${session.value.id}/mcp`
    });
}

async function getAgentSessionById(trx: Knex, id: string): Promise<Result<AgentSession, AgentSessionError>> {
    const session = await trx<DBAgentSession>(AGENT_SESSIONS_TABLE).where({ id }).first();
    if (!session) {
        return Err(new AgentSessionError({ code: 'not_found', message: 'Agent session not found', payload: { sessionId: id } }));
    }

    return Ok(toAgentSession(session));
}

function jsonb(trx: Knex, value: object): Knex.Raw {
    return trx.raw('?::jsonb', [JSON.stringify(value)]);
}

function requestedConfig(params: CreateAgentSessionParams): Record<string, unknown> {
    return {
        connections: params.connections,
        toolset: params.toolset,
        pinnedTools: params.pinnedTools,
        metaTools: params.metaTools,
        expiresInMs: params.expiresInMs
    };
}

/**
 * Tags are customer data and creating a session does not require the connections read scope, so a
 * candidate keeps the connection id the caller needs to pin it and loses everything else. The
 * operation above already recorded the full payload, which is where an ambiguity gets debugged.
 */
function withoutCandidateTags(error: AgentSessionCreationError): AgentSessionCreationError {
    return new AgentSessionCreationError({
        code: error.code,
        message: error.message,
        payload: redactCandidates(error.payload) as Record<string, unknown>,
        cause: error.cause
    });
}

function redactCandidates(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(redactCandidates);
    }

    if (value === null || typeof value !== 'object') {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, nested]) =>
            key === 'candidates' && Array.isArray(nested) ? [key, nested.map(onlyConnectionId)] : [key, redactCandidates(nested)]
        )
    );
}

function onlyConnectionId(candidate: unknown): unknown {
    if (candidate === null || typeof candidate !== 'object') {
        return candidate;
    }

    return Object.fromEntries(Object.entries(candidate).filter(([field]) => field === 'connection_id'));
}

function rejected(error: { code: AgentSessionCreationErrorCode; message: string; payload: Record<string, unknown> }): AgentSessionCreationError {
    return new AgentSessionCreationError({ code: error.code, message: error.message, payload: error.payload });
}

function creationFailedError(params: InsertAgentSessionParams, cause?: unknown): AgentSessionError {
    return new AgentSessionError({
        code: 'creation_failed',
        message: 'Failed to create agent session',
        payload: { accountId: params.accountId, environmentId: params.environmentId },
        cause
    });
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

function toAgentSession(session: DBAgentSession): AgentSession {
    return {
        id: session.id,
        environmentId: session.environment_id,
        accountId: session.account_id,
        resolvedConnections: session.resolved_connections,
        compiledToolset: session.compiled_toolset,
        metaTools: { ...session.meta_tools, nangoCreateConnection: session.meta_tools.nangoCreateConnection ?? DEFAULT_CREATE_CONNECTION_CONFIG },
        expiresAt: session.expires_at,
        endedAt: session.ended_at,
        endedReason: session.ended_reason,
        createdAt: session.created_at,
        updatedAt: session.updated_at
    };
}
