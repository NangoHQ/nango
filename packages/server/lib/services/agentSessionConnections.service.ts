import { z } from 'zod';

import { connectionService, connectionTagsSchema } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema } from '../helpers/validation.js';

import type {
    AgentSessionAmbiguousConnectionsPayload,
    AgentSessionConnectionCandidate,
    AgentSessionConnectionCandidateReport,
    AgentSessionConnectionResolutionErrorCode,
    AgentSessionConnectionSelector,
    AgentSessionPinnedConnection,
    AgentSessionResolvedConnection,
    AgentSessionResolvedConnections,
    AgentSessionTenantConnections,
    AgentSessionUnknownPinnedConnectionsPayload
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export const MAX_SELECTORS = 10;
export const MAX_PINNED_CONNECTIONS = 50;

/**
 * A tenant selector is expected to match a handful of connections, one per integration. Reading one
 * row past the limit turns a pathologically broad selector into an error instead of a truncated
 * candidate list, which could otherwise hide the second candidate of an integration and resolve a
 * connection the caller never pinned.
 */
export const MAX_CANDIDATES_PER_SELECTOR = 200;

const selectorSchema = z
    .strictObject({
        tags: connectionTagsSchema.optional(),
        end_user_id: z.string().min(1).max(255).optional(),
        end_user_organization_id: z.string().min(1).max(255).optional()
    })
    .refine((selector) => selector.tags !== undefined || selector.end_user_id !== undefined || selector.end_user_organization_id !== undefined, {
        message: 'A connection selector must constrain at least one of tags, end_user_id or end_user_organization_id'
    });

/**
 * Public shape of `tenant.connections`. `any` is an OR between selectors, and the constraints within
 * one selector are matched together. `pinned` names connections outright, both for breaking ties
 * between selectors and for the customer who resolves connections themselves and sends ids.
 */
export const agentSessionTenantConnectionsSchema = z
    .strictObject({
        any: z.array(selectorSchema).max(MAX_SELECTORS).optional(),
        pinned: z
            .array(
                z.strictObject({
                    integration_id: providerConfigKeySchema,
                    connection_id: connectionIdSchema
                })
            )
            .max(MAX_PINNED_CONNECTIONS)
            .refine((pinned) => new Set(pinned.map((pin) => pin.integration_id)).size === pinned.length, {
                message: 'Only one connection can be pinned per integration'
            })
            .optional()
    })
    .refine((connections) => (connections.any?.length ?? 0) > 0 || (connections.pinned?.length ?? 0) > 0, {
        message: 'Provide at least one connection selector in any, or at least one pinned connection'
    })
    .transform(
        (connections): AgentSessionTenantConnections => ({
            any: (connections.any ?? []).map((selector) => ({
                tags: selector.tags,
                endUserId: selector.end_user_id,
                endUserOrganizationId: selector.end_user_organization_id
            })),
            pinned: (connections.pinned ?? []).map((pin) => ({
                integrationId: pin.integration_id,
                connectionId: pin.connection_id
            }))
        })
    );

export class AgentSessionConnectionResolutionError extends Error {
    public readonly code: AgentSessionConnectionResolutionErrorCode;
    public readonly payload: Record<string, unknown>;

    constructor({ code, message, payload }: { code: AgentSessionConnectionResolutionErrorCode; message: string; payload: Record<string, unknown> }) {
        super(message);
        this.name = 'AgentSessionConnectionResolutionError';
        this.code = code;
        this.payload = payload;
    }
}

/**
 * Runs one listConnections call per selector so each keeps the GIN-indexed `tags @> ?::jsonb`
 * containment path, then unions the results. That union is the OR between selectors.
 */
export async function listTenantConnectionCandidates({
    environmentId,
    selectors
}: {
    environmentId: number;
    selectors: AgentSessionConnectionSelector[];
}): Promise<Result<AgentSessionConnectionCandidate[], AgentSessionConnectionResolutionError>> {
    const byInternalId = new Map<number, AgentSessionConnectionCandidate>();

    for (const selector of selectors) {
        const rows = await connectionService.listConnections({
            environmentId,
            tags: selector.tags,
            endUserId: selector.endUserId,
            endUserOrganizationId: selector.endUserOrganizationId,
            limit: MAX_CANDIDATES_PER_SELECTOR + 1
        });

        if (rows.length > MAX_CANDIDATES_PER_SELECTOR) {
            return Err(
                new AgentSessionConnectionResolutionError({
                    code: 'selector_too_broad',
                    message: `A connection selector matched more than ${MAX_CANDIDATES_PER_SELECTOR} connections. Narrow the selector so it identifies one tenant.`,
                    payload: { limit: MAX_CANDIDATES_PER_SELECTOR }
                })
            );
        }

        for (const row of rows) {
            byInternalId.set(row.connection.id, toCandidate(row));
        }
    }

    return Ok([...byInternalId.values()]);
}

/**
 * Looks up each pinned connection in the environment. A pin stands on its own rather than narrowing
 * the selectors, so the connection only has to exist, be live, and belong to the integration named.
 */
export async function listPinnedConnections({
    environmentId,
    pinned
}: {
    environmentId: number;
    pinned: AgentSessionPinnedConnection[];
}): Promise<Result<AgentSessionConnectionCandidate[], AgentSessionConnectionResolutionError>> {
    const found: AgentSessionConnectionCandidate[] = [];
    const unknown: AgentSessionUnknownPinnedConnectionsPayload['pinned'] = [];

    for (const pin of pinned) {
        const [row] = await connectionService.listConnections({
            environmentId,
            connectionId: pin.connectionId,
            integrationIds: [pin.integrationId],
            limit: 1
        });

        if (row) {
            found.push(toCandidate(row));
        } else {
            unknown.push({ integration_id: pin.integrationId, connection_id: pin.connectionId });
        }
    }

    if (unknown.length > 0) {
        const payload: AgentSessionUnknownPinnedConnectionsPayload = { pinned: unknown };
        return Err(
            new AgentSessionConnectionResolutionError({
                code: 'unknown_pinned_connection',
                message: `${unknown.length} pinned ${unknown.length === 1 ? 'connection does' : 'connections do'} not exist on the integration given. Check the connection id and the integration id.`,
                payload: { ...payload }
            })
        );
    }

    return Ok(found);
}

/**
 * Pure resolution: one connection per integration, or a report naming the candidates the caller has
 * to choose between. A pinned connection is authoritative for its integration, whether or not the
 * selectors matched it. Zero matches is not an error, the integration is simply absent from the
 * result and the session exposes it as not connected.
 */
export function resolveTenantConnections({
    candidates,
    pinned
}: {
    candidates: AgentSessionConnectionCandidate[];
    pinned: AgentSessionConnectionCandidate[];
}): Result<AgentSessionResolvedConnections, AgentSessionConnectionResolutionError> {
    const resolved: Record<string, AgentSessionResolvedConnection> = {};
    for (const connection of pinned) {
        resolved[connection.integrationId] = toResolvedConnection(connection);
    }

    const candidatesByIntegration = new Map<string, AgentSessionConnectionCandidate[]>();
    for (const candidate of candidates) {
        if (resolved[candidate.integrationId]) {
            continue;
        }

        const forIntegration = candidatesByIntegration.get(candidate.integrationId) ?? [];
        forIntegration.push(candidate);
        candidatesByIntegration.set(candidate.integrationId, forIntegration);
    }

    const ambiguous: Record<string, { candidates: AgentSessionConnectionCandidateReport[] }> = {};

    for (const [integrationId, forIntegration] of candidatesByIntegration) {
        const [onlyCandidate, ...rest] = forIntegration;
        if (!onlyCandidate || rest.length > 0) {
            ambiguous[integrationId] = { candidates: forIntegration.map(toCandidateReport) };
            continue;
        }

        resolved[integrationId] = toResolvedConnection(onlyCandidate);
    }

    const ambiguousIntegrations = Object.keys(ambiguous);
    if (ambiguousIntegrations.length > 0) {
        const payload: AgentSessionAmbiguousConnectionsPayload = { integrations: ambiguous };
        return Err(
            new AgentSessionConnectionResolutionError({
                code: 'ambiguous_connections',
                message: `${ambiguousIntegrations.length} ${ambiguousIntegrations.length === 1 ? 'integration' : 'integrations'} matched more than one connection. Narrow the connection tags or pin a connection id.`,
                payload: { ...payload }
            })
        );
    }

    return Ok(resolved);
}

export async function resolveTenantConnectionsForEnvironment({
    environmentId,
    connections
}: {
    environmentId: number;
    connections: AgentSessionTenantConnections;
}): Promise<Result<AgentSessionResolvedConnections, AgentSessionConnectionResolutionError>> {
    const pinned = await listPinnedConnections({ environmentId, pinned: connections.pinned });
    if (pinned.isErr()) {
        return Err(pinned.error);
    }

    const candidates = await listTenantConnectionCandidates({ environmentId, selectors: connections.any });
    if (candidates.isErr()) {
        return Err(candidates.error);
    }

    return resolveTenantConnections({ candidates: candidates.value, pinned: pinned.value });
}

function toCandidate(row: Awaited<ReturnType<typeof connectionService.listConnections>>[number]): AgentSessionConnectionCandidate {
    return {
        integrationId: row.integration_id,
        provider: row.provider,
        connectionId: row.connection.connection_id,
        internalConnectionId: row.connection.id,
        configId: row.connection.config_id,
        tags: row.connection.tags
    };
}

function toResolvedConnection(candidate: AgentSessionConnectionCandidate): AgentSessionResolvedConnection {
    return {
        integrationId: candidate.integrationId,
        provider: candidate.provider,
        connectionId: candidate.connectionId,
        internalConnectionId: candidate.internalConnectionId,
        configId: candidate.configId
    };
}

function toCandidateReport(candidate: AgentSessionConnectionCandidate): AgentSessionConnectionCandidateReport {
    return { connection_id: candidate.connectionId, tags: candidate.tags };
}
