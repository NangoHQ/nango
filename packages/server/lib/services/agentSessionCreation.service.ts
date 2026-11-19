import db from '@nangohq/database';
import { logContextGetter } from '@nangohq/logs';
import { baseUrl, Err, Ok, report } from '@nangohq/utils';

import {
    createAgentSessionToken,
    DEFAULT_CREATE_CONNECTION_CONFIG,
    insertAgentSession,
    resolvedConnectionsSummary,
    toolsetToolNames
} from './agentSession.service.js';
import * as agentSessionConnectionsService from './agentSessionConnections.service.js';
import * as agentSessionMcpDiscoveryService from './agentSessionMcpDiscovery.service.js';
import * as agentSessionToolsetService from './agentSessionToolset.service.js';

import type {
    AgentSession,
    AgentSessionCreationErrorCode,
    AgentSessionMetaTools,
    AgentSessionPinnedTools,
    AgentSessionTenantConnections,
    AgentSessionToolsetPolicy,
    DBEnvironment,
    DBPlan,
    DBTeam
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const DEFAULT_EXPIRES_IN_MS = 15 * 24 * 60 * 60 * 1000;

const DEFAULT_META_TOOLS: AgentSessionMetaTools = {
    nangoToolSearch: true,
    nangoExecute: true,
    // Off by default: it reaches any endpoint of a connected integration, not only the toolset's tools.
    nangoProxy: false,
    nangoCreateConnection: DEFAULT_CREATE_CONNECTION_CONFIG
};

export interface CreateAgentSessionParams {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
    connections: AgentSessionTenantConnections;
    toolset: AgentSessionToolsetPolicy | undefined;
    pinnedTools: AgentSessionPinnedTools | undefined;
    metaTools: Partial<AgentSessionMetaTools> | undefined;
    expiresInMs: number | undefined;
}

export interface CreatedAgentSession {
    session: AgentSession;
    token: string;
    mcpUrl: string;
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
        const created = await runCreation(params);
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

async function runCreation(params: CreateAgentSessionParams): Promise<Result<CreatedAgentSession, AgentSessionCreationError>> {
    const { account, environment } = params;

    const resolvedConnections = await agentSessionConnectionsService.resolveTenantConnections({
        environmentId: environment.id,
        connections: params.connections
    });
    if (resolvedConnections.isErr()) {
        return Err(rejected(resolvedConnections.error));
    }

    const connectedIntegrations = Object.keys(resolvedConnections.value);
    const mcpServers = await agentSessionMcpDiscoveryService.discoverMcpTools({
        account,
        environment,
        plan: params.plan,
        connections: agentSessionToolsetService
            .integrationsInScope({ toolset: params.toolset, pinnedTools: params.pinnedTools, connectedIntegrations })
            .flatMap((integrationId) => (resolvedConnections.value[integrationId] ? [resolvedConnections.value[integrationId]] : []))
    });

    const compiledToolset = await agentSessionToolsetService.compileToolset({
        environmentId: environment.id,
        toolset: params.toolset,
        pinnedTools: params.pinnedTools,
        connectedIntegrations,
        mcpServers
    });
    if (compiledToolset.isErr()) {
        return Err(rejected(compiledToolset.error));
    }

    // A session no token can reach is unusable, so a failed mint rolls back the insert with it.
    try {
        return await db.knex.transaction(async (trx) => {
            const session = (
                await insertAgentSession(trx, {
                    accountId: account.id,
                    environmentId: environment.id,
                    resolvedConnections: resolvedConnections.value,
                    compiledToolset: compiledToolset.value,
                    metaTools: { ...DEFAULT_META_TOOLS, ...params.metaTools },
                    expiresAt: new Date(Date.now() + (params.expiresInMs ?? DEFAULT_EXPIRES_IN_MS))
                })
            ).unwrap();
            const { token } = (await createAgentSessionToken(trx, session)).unwrap();

            return Ok({ session, token, mcpUrl: `${baseUrl}/session/${session.id}/mcp` });
        });
    } catch (err) {
        report(err);
        return Err(new AgentSessionCreationError({ code: 'server_error', message: 'Failed to create agent session', cause: err }));
    }
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
