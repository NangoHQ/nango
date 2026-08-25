import { z } from 'zod';

import db from '@nangohq/database';
import { logContextGetter } from '@nangohq/logs';
import { baseUrl, report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import * as agentSessionService from '../../services/agentSession.service.js';
import * as agentSessionConnectionsService from '../../services/agentSessionConnections.service.js';
import * as agentSessionToolsetService from '../../services/agentSessionToolset.service.js';
import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';

import type { LogContextOrigin } from '@nangohq/logs';
import type {
    AgentSessionCompiledToolset,
    AgentSessionCreationErrorCode,
    AgentSessionCreationErrorPayload,
    AgentSessionMetaTools,
    AgentSessionResolvedConnections,
    AgentSessionToolsetSummary,
    PostAgentSessions
} from '@nangohq/types';
import type { Response } from 'express';

const MIN_EXPIRES_IN_MS = 60 * 1000;
const MAX_EXPIRES_IN_MS = 15 * 24 * 60 * 60 * 1000;
const DEFAULT_EXPIRES_IN_MS = MAX_EXPIRES_IN_MS;

const EXPIRES_IN_UNITS_IN_MS: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
};

const META_TOOLS = ['nango_tool_search', 'nango_execute'] as const;

const DEFAULT_META_TOOLS: AgentSessionMetaTools = { nangoToolSearch: true, nangoExecute: true };

const expiresInSchema = z
    .string()
    .regex(/^[1-9]\d*[smhd]$/, { message: 'expires_in must be a positive integer followed by s, m, h or d, for example 1h' })
    .refine((value) => expiresInToMs(value) >= MIN_EXPIRES_IN_MS, { message: 'expires_in cannot be shorter than 60s' })
    .refine((value) => expiresInToMs(value) <= MAX_EXPIRES_IN_MS, { message: 'expires_in cannot exceed 15d' });

const bodySchema = z.strictObject({
    tenant: z.strictObject({
        connections: agentSessionConnectionsService.agentSessionTenantConnectionsSchema
    }),
    toolset: agentSessionToolsetService.agentSessionToolsetSchema.optional(),
    pinned_tools: agentSessionToolsetService.agentSessionPinnedToolsSchema.optional(),
    meta_tools: z.record(z.string(), z.boolean()).optional(),
    expires_in: expiresInSchema.optional()
});

export const postAgentSessions = asyncWrapperWithEnvironment<PostAgentSessions>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const body = bodySchema.safeParse(req.body);
    if (!body.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(body.error) } });
        return;
    }

    const { account, environment } = res.locals;
    const logCtx = await logContextGetter.create(
        { operation: { type: 'agent_session', action: 'create' } },
        { account, environment, meta: { requested: req.body } }
    );

    try {
        const metaTools = parseMetaTools(body.data.meta_tools);
        if (metaTools.unknown.length > 0) {
            await rejectCreation(res, logCtx, {
                code: 'unknown_meta_tool',
                message: `${metaTools.unknown.length} ${metaTools.unknown.length === 1 ? 'key is' : 'keys are'} not a meta tool Nango ships. Supported meta tools are ${META_TOOLS.join(', ')}.`,
                payload: { meta_tools: metaTools.unknown }
            });
            return;
        }

        const resolvedConnections = await agentSessionConnectionsService.resolveTenantConnections({
            environmentId: environment.id,
            connections: body.data.tenant.connections
        });
        if (resolvedConnections.isErr()) {
            await rejectCreation(res, logCtx, resolvedConnections.error);
            return;
        }

        const compiledToolset = await agentSessionToolsetService.compileToolset({
            environmentId: environment.id,
            toolset: body.data.toolset,
            pinnedTools: body.data.pinned_tools,
            connectedIntegrations: Object.keys(resolvedConnections.value)
        });
        if (compiledToolset.isErr()) {
            await rejectCreation(res, logCtx, compiledToolset.error);
            return;
        }

        const expiresAt = new Date(Date.now() + (body.data.expires_in ? expiresInToMs(body.data.expires_in) : DEFAULT_EXPIRES_IN_MS));

        const session = await agentSessionService.createAgentSession(db.knex, {
            accountId: account.id,
            environmentId: environment.id,
            resolvedConnections: resolvedConnections.value,
            compiledToolset: compiledToolset.value,
            metaTools: metaTools.applied,
            expiresAt
        });
        if (session.isErr()) {
            report(session.error);
            void logCtx.error('Failed to create the agent session', { error: session.error });
            await logCtx.failed();
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to create agent session' } });
            return;
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
                void logCtx.error('Failed to end the agent session left behind by the token failure', {
                    error: ended.error,
                    sessionId: session.value.id
                });
            }

            report(token.error);
            void logCtx.error('Failed to mint the agent session token', { error: token.error });
            await logCtx.failed();
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to create agent session token' } });
            return;
        }

        await logCtx.enrichOperation({
            actor: { kind: 'session', id: session.value.id },
            meta: {
                requested: req.body,
                resolvedConnections: resolvedConnections.value,
                toolset: compiledToolset.value,
                metaTools: metaTools.applied,
                expiresAt: expiresAt.toISOString()
            }
        });
        void logCtx.info('Agent session created');
        await logCtx.success();

        res.status(201).send({
            data: {
                session_id: session.value.id,
                session_token: token.value.token,
                mcp_url: mcpUrl(session.value.id),
                expires_at: session.value.expiresAt.toISOString(),
                toolset: toolsetSummary(session.value.compiledToolset, session.value.resolvedConnections),
                meta_tools: {
                    nango_tool_search: session.value.metaTools.nangoToolSearch,
                    nango_execute: session.value.metaTools.nangoExecute
                }
            }
        });
    } catch (err) {
        void logCtx.error('Failed to create the agent session', { error: err });
        await logCtx.failed();
        throw err;
    }
});

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

export function expiresInToMs(expiresIn: string): number {
    const unit = expiresIn.slice(-1);
    return parseInt(expiresIn.slice(0, -1), 10) * EXPIRES_IN_UNITS_IN_MS[unit]!;
}

function mcpUrl(sessionId: string): string {
    return `${baseUrl}/session/${sessionId}/mcp`;
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

async function rejectCreation(
    res: Response<PostAgentSessions['Reply']>,
    logCtx: LogContextOrigin,
    error: { code: AgentSessionCreationErrorCode; message: string; payload: Record<string, unknown> }
): Promise<void> {
    void logCtx.error(error.message, { code: error.code, payload: error.payload });
    await logCtx.failed();

    res.status(400).send({ error: { code: error.code, message: error.message, payload: error.payload as unknown as AgentSessionCreationErrorPayload } });
}
