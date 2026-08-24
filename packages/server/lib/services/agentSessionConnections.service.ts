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
    AgentSessionPinnedConnectionNotMatchedPayload,
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

// Tags are the only selector. End users are already projected onto connection tags on creation, so
// an end user selector would be a second way to express the same match, on a slower query path.
const selectorSchema = z.strictObject({
    tags: connectionTagsSchema.refine((tags) => Object.keys(tags).length > 0, {
        message: 'A connection selector must carry at least one tag'
    })
});

/**
 * Public shape of `tenant.connections`. `any` is an OR between selectors, and the constraints within
 * one selector are matched together. `pinned` then picks among what the selectors matched. Leaving
 * `any` off applies no tag filter, which is how a customer who resolves connections themselves pins
 * ids directly.
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
            any: (connections.any ?? []).map((selector) => ({ tags: selector.tags })),
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
 * Looks up each pinned connection in the environment, for the tenant that applies no tag filter.
 * These lookups become the candidate set, so the pins are what the session resolves.
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
 * to choose between. Selectors filter first and a pin picks from what they matched, so a pin can
 * never reach a connection the selectors excluded. Zero matches is not an error, the integration is
 * simply absent from the result and the session exposes it as not connected.
 */
export function resolveTenantConnections({
    candidates,
    pinned
}: {
    candidates: AgentSessionConnectionCandidate[];
    pinned: AgentSessionPinnedConnection[];
}): Result<AgentSessionResolvedConnections, AgentSessionConnectionResolutionError> {
    const candidatesByIntegration = new Map<string, AgentSessionConnectionCandidate[]>();
    for (const candidate of candidates) {
        const forIntegration = candidatesByIntegration.get(candidate.integrationId) ?? [];
        forIntegration.push(candidate);
        candidatesByIntegration.set(candidate.integrationId, forIntegration);
    }

    const resolved: Record<string, AgentSessionResolvedConnection> = {};
    const notMatched: AgentSessionPinnedConnectionNotMatchedPayload['pinned'] = [];

    for (const pin of pinned) {
        const forIntegration = candidatesByIntegration.get(pin.integrationId) ?? [];
        const pinnedCandidate = forIntegration.find((candidate) => candidate.connectionId === pin.connectionId);

        if (!pinnedCandidate) {
            notMatched.push({
                integration_id: pin.integrationId,
                connection_id: pin.connectionId,
                candidates: forIntegration.map(toCandidateReport)
            });
            continue;
        }

        resolved[pin.integrationId] = toResolvedConnection(pinnedCandidate);
    }

    if (notMatched.length > 0) {
        const payload: AgentSessionPinnedConnectionNotMatchedPayload = { pinned: notMatched };
        return Err(
            new AgentSessionConnectionResolutionError({
                code: 'pinned_connection_not_matched',
                message: `${notMatched.length} pinned ${notMatched.length === 1 ? 'connection is' : 'connections are'} not among the connections the selectors matched. A pin chooses between matched connections, so widen the selectors or pin one of the candidates.`,
                payload: { ...payload }
            })
        );
    }

    const ambiguous: Record<string, { candidates: AgentSessionConnectionCandidateReport[] }> = {};

    for (const [integrationId, forIntegration] of candidatesByIntegration) {
        if (resolved[integrationId]) {
            continue;
        }

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
    // With no selectors there is no tag filter to resolve against, so the pinned connections are
    // themselves the candidate set and the pin check below is satisfied by construction.
    const candidates =
        connections.any.length > 0
            ? await listTenantConnectionCandidates({ environmentId, selectors: connections.any })
            : await listPinnedConnections({ environmentId, pinned: connections.pinned });

    if (candidates.isErr()) {
        return Err(candidates.error);
    }

    return resolveTenantConnections({ candidates: candidates.value, pinned: connections.pinned });
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
