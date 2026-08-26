import { z } from 'zod';

import db from '@nangohq/database';
import { logContextGetter } from '@nangohq/logs';
import { baseUrl, Err, Ok, report } from '@nangohq/utils';

import * as agentSessionService from './agentSession.service.js';
import * as agentSessionConnectionsService from './agentSessionConnections.service.js';
import * as agentSessionToolsetService from './agentSessionToolset.service.js';

import type { LogContextOrigin } from '@nangohq/logs';
import type {
    AgentSession,
    AgentSessionCompiledToolset,
    AgentSessionCreationErrorCode,
    AgentSessionMetaTools,
    AgentSessionMetaToolsSummary,
    AgentSessionPinnedTools,
    AgentSessionResolvedConnections,
    AgentSessionTenantConnections,
    AgentSessionToolsetPolicy,
    AgentSessionToolsetSummary,
    DBEnvironment,
    DBTeam
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

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

const META_TOOLS = ['nango_tool_search', 'nango_execute'] as const;

const DEFAULT_META_TOOLS: AgentSessionMetaTools = { nangoToolSearch: true, nangoExecute: true };

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

export interface CreateAgentSessionParams {
    account: DBTeam;
    environment: DBEnvironment;
    connections: AgentSessionTenantConnections;
    toolset: AgentSessionToolsetPolicy | undefined;
    pinnedTools: AgentSessionPinnedTools | undefined;
    metaTools: Record<string, boolean> | undefined;
    expiresInMs: number | undefined;
}

export interface CreatedAgentSession {
    session: AgentSession;
    token: string;
    mcpUrl: string;
    toolset: Record<string, AgentSessionToolsetSummary>;
    metaTools: AgentSessionMetaToolsSummary;
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
                resolvedConnections: created.value.session.resolvedConnections,
                toolset: created.value.session.compiledToolset,
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

export function expiresInToMs(expiresIn: string): number | null {
    const match = EXPIRES_IN_PATTERN.exec(expiresIn);
    if (!match) {
        return null;
    }

    const [, amount, unit] = match;
    const unitInMs = unit ? EXPIRES_IN_UNITS_IN_MS[unit] : undefined;

    return unitInMs ? Number(amount) * unitInMs : null;
}

export function toolsetSummary(
    toolset: AgentSessionCompiledToolset,
    resolvedConnections: AgentSessionResolvedConnections
): Record<string, AgentSessionToolsetSummary> {
    return Object.fromEntries(
        Object.entries(toolset).map(([integrationId, integration]) => [
            integrationId,
            {
                connected: Object.hasOwn(resolvedConnections, integrationId),
                tools_pinned: integration.pinned.length,
                tools_searchable: integration.searchable.length
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
                message: `${metaTools.unknown.length} ${metaTools.unknown.length === 1 ? 'key is' : 'keys are'} not a meta tool Nango ships. Supported meta tools are ${META_TOOLS.join(', ')}.`,
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

    const session = await agentSessionService.createAgentSession(db.knex, {
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

    const token = await agentSessionService.createAgentSessionToken(db.knex, session.value);
    if (token.isErr()) {
        // A session no token can reach is unusable, so it is ended rather than left to expire.
        const ended = await agentSessionService.terminateAgentSession(db.knex, {
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
        mcpUrl: `${baseUrl}/session/${session.value.id}/mcp`,
        toolset: toolsetSummary(session.value.compiledToolset, session.value.resolvedConnections),
        metaTools: {
            nango_tool_search: session.value.metaTools.nangoToolSearch,
            nango_execute: session.value.metaTools.nangoExecute
        }
    });
}

function parseMetaTools(requested: Record<string, boolean> | undefined): { applied: AgentSessionMetaTools; unknown: string[] } {
    const unknown = Object.keys(requested ?? {}).filter((key) => !META_TOOLS.includes(key as (typeof META_TOOLS)[number]));

    return {
        applied: {
            nangoToolSearch: requested?.['nango_tool_search'] ?? DEFAULT_META_TOOLS.nangoToolSearch,
            nangoExecute: requested?.['nango_execute'] ?? DEFAULT_META_TOOLS.nangoExecute
        },
        unknown
    };
}

function rejected(error: { code: AgentSessionCreationErrorCode; message: string; payload: Record<string, unknown> }): AgentSessionCreationError {
    return new AgentSessionCreationError({ code: error.code, message: error.message, payload: error.payload });
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

function requestedConfig(params: CreateAgentSessionParams): Record<string, unknown> {
    return {
        connections: params.connections,
        toolset: params.toolset,
        pinnedTools: params.pinnedTools,
        metaTools: params.metaTools,
        expiresInMs: params.expiresInMs
    };
}
