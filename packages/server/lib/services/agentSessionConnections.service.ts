import { z } from 'zod';

import { connectionService, connectionTagsSchema } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema } from '../helpers/validation.js';

import type { ConnectionIntegrationMatchRow, ConnectionMatch, ConnectionMatchCandidate } from '@nangohq/shared';
import type {
    AgentSessionAmbiguousConnectionsPayload,
    AgentSessionConnectionCandidateReport,
    AgentSessionConnectionResolutionErrorCode,
    AgentSessionPinnedConnection,
    AgentSessionPinnedConnectionNotMatchedPayload,
    AgentSessionResolvedConnection,
    AgentSessionResolvedConnections,
    AgentSessionTenantConnections,
    AgentSessionUnknownPinnedConnectionsPayload
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export const MAX_SELECTORS = 10;
export const CANDIDATE_SAMPLE_SIZE = 10;

const selectorSchema = z.strictObject({
    tags: connectionTagsSchema.refine((tags) => Object.keys(tags).length > 0, {
        message: 'A connection selector must carry at least one tag'
    })
});

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

export async function resolveTenantConnectionsForEnvironment({
    environmentId,
    connections
}: {
    environmentId: number;
    connections: AgentSessionTenantConnections;
}): Promise<Result<AgentSessionResolvedConnections, AgentSessionConnectionResolutionError>> {
    const tagSelectors = connections.any.map((selector) => selector.tags);

    const matches = await connectionService.groupConnectionMatchesByIntegration({
        environmentId,
        tagSelectors,
        candidateSampleSize: CANDIDATE_SAMPLE_SIZE
    });

    const verifiedPins: ConnectionMatch[] = [];
    const unknownPins: AgentSessionPinnedConnection[] = [];
    const notMatchedPins: AgentSessionPinnedConnection[] = [];

    for (const pin of connections.pinned) {
        const target = { environmentId, integrationId: pin.integrationId, connectionId: pin.connectionId };

        // Queried per pin rather than searched in the samples above, which only hold part of the set.
        const matched = await connectionService.findConnectionMatchingSelectors({ ...target, tagSelectors });
        if (matched) {
            verifiedPins.push(matched);
            continue;
        }

        const exists = tagSelectors.length > 0 && (await connectionService.findConnectionMatchingSelectors({ ...target, tagSelectors: [] }));
        if (exists) {
            notMatchedPins.push(pin);
        } else {
            unknownPins.push(pin);
        }
    }

    return resolveTenantConnections({ matches, verifiedPins, unknownPins, notMatchedPins });
}

export function resolveTenantConnections({
    matches,
    verifiedPins,
    unknownPins,
    notMatchedPins
}: {
    matches: ConnectionIntegrationMatchRow[];
    verifiedPins: ConnectionMatch[];
    unknownPins: AgentSessionPinnedConnection[];
    notMatchedPins: AgentSessionPinnedConnection[];
}): Result<AgentSessionResolvedConnections, AgentSessionConnectionResolutionError> {
    if (unknownPins.length > 0) {
        return Err(unknownPinnedConnectionError(unknownPins));
    }

    if (notMatchedPins.length > 0) {
        return Err(pinnedNotMatchedError(notMatchedPins, matches));
    }

    // Maps rather than plain objects: an integration id of `__proto__` would not become an own
    // property, and the integration would silently drop out of the result.
    const resolved = new Map<string, AgentSessionResolvedConnection>();
    for (const pin of verifiedPins) {
        resolved.set(pin.integration_id, toResolvedConnection(pin.integration_id, pin.provider, pin.candidate));
    }

    const ambiguous = new Map<string, AgentSessionAmbiguousConnectionsPayload['integrations'][string]>();

    for (const match of matches) {
        if (resolved.has(match.integration_id)) {
            continue;
        }

        const [onlyCandidate] = match.candidates;
        if (match.match_count > 1 || !onlyCandidate) {
            ambiguous.set(match.integration_id, { match_count: match.match_count, candidates: match.candidates.map(toCandidateReport) });
            continue;
        }

        resolved.set(match.integration_id, toResolvedConnection(match.integration_id, match.provider, onlyCandidate));
    }

    if (ambiguous.size > 0) {
        const payload: AgentSessionAmbiguousConnectionsPayload = { integrations: Object.fromEntries(ambiguous) };
        return Err(
            new AgentSessionConnectionResolutionError({
                code: 'ambiguous_connections',
                message: `${ambiguous.size} ${ambiguous.size === 1 ? 'integration' : 'integrations'} matched more than one connection. Narrow the connection tags or pin a connection id.`,
                payload: { ...payload }
            })
        );
    }

    return Ok(Object.fromEntries(resolved));
}

function unknownPinnedConnectionError(rejected: AgentSessionPinnedConnection[]): AgentSessionConnectionResolutionError {
    const payload: AgentSessionUnknownPinnedConnectionsPayload = {
        pinned: rejected.map((pin) => ({ integration_id: pin.integrationId, connection_id: pin.connectionId }))
    };

    return new AgentSessionConnectionResolutionError({
        code: 'unknown_pinned_connection',
        message: `${rejected.length} pinned ${rejected.length === 1 ? 'connection does' : 'connections do'} not exist on the integration given. Check the connection id and the integration id.`,
        payload: { ...payload }
    });
}

function pinnedNotMatchedError(rejected: AgentSessionPinnedConnection[], matches: ConnectionIntegrationMatchRow[]): AgentSessionConnectionResolutionError {
    const byIntegration = new Map(matches.map((match) => [match.integration_id, match]));
    const payload: AgentSessionPinnedConnectionNotMatchedPayload = {
        pinned: rejected.map((pin) => ({
            integration_id: pin.integrationId,
            connection_id: pin.connectionId,
            candidates: (byIntegration.get(pin.integrationId)?.candidates ?? []).map(toCandidateReport)
        }))
    };

    return new AgentSessionConnectionResolutionError({
        code: 'pinned_connection_not_matched',
        message: `${rejected.length} pinned ${rejected.length === 1 ? 'connection is' : 'connections are'} not among the connections the selectors matched. A pin chooses between matched connections, so widen the selectors or pin one of the candidates.`,
        payload: { ...payload }
    });
}

function toResolvedConnection(integrationId: string, provider: string, candidate: ConnectionMatchCandidate): AgentSessionResolvedConnection {
    return {
        integrationId,
        provider,
        connectionId: candidate.connection_id,
        internalConnectionId: candidate.id,
        configId: candidate.config_id
    };
}

function toCandidateReport(candidate: ConnectionMatchCandidate): AgentSessionConnectionCandidateReport {
    return { connection_id: candidate.connection_id, tags: candidate.tags };
}
