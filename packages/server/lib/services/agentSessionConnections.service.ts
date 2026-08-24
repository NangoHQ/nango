import { z } from 'zod';

import { connectionService, connectionTagsSchema } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema } from '../helpers/validation.js';

import type { ConnectionMatchCandidate } from '@nangohq/shared';
import type {
    AgentSessionAmbiguousConnectionsPayload,
    AgentSessionConnectionCandidate,
    AgentSessionConnectionCandidateReport,
    AgentSessionConnectionResolutionErrorCode,
    AgentSessionIntegrationMatch,
    AgentSessionPinnedConnection,
    AgentSessionPinnedConnectionNotMatchedPayload,
    AgentSessionResolvedConnection,
    AgentSessionResolvedConnections,
    AgentSessionTenantConnections,
    AgentSessionUnknownPinnedConnectionsPayload,
    Tags
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

export async function listIntegrationMatches({
    environmentId,
    selectors
}: {
    environmentId: number;
    selectors: AgentSessionConnectionSelectorList;
}): Promise<AgentSessionIntegrationMatch[]> {
    const groups = await connectionService.groupConnectionMatchesByIntegration({
        environmentId,
        tagSelectors: selectors,
        candidateSampleSize: CANDIDATE_SAMPLE_SIZE
    });

    return groups.map((group) => ({
        integrationId: group.integration_id,
        provider: group.provider,
        matchCount: group.match_count,
        candidates: group.candidates.map((candidate) => toCandidate({ integrationId: group.integration_id, provider: group.provider, candidate }))
    }));
}

/** Queries per pin rather than searching the candidate sample, which only holds part of the set. */
export async function checkPinnedConnections({
    environmentId,
    selectors,
    pinned
}: {
    environmentId: number;
    selectors: AgentSessionConnectionSelectorList;
    pinned: AgentSessionPinnedConnection[];
}): Promise<{ verified: AgentSessionConnectionCandidate[]; rejected: AgentSessionPinnedConnection[] }> {
    const verified: AgentSessionConnectionCandidate[] = [];
    const rejected: AgentSessionPinnedConnection[] = [];

    for (const pin of pinned) {
        const row = await connectionService.findConnectionMatchingSelectors({
            environmentId,
            integrationId: pin.integrationId,
            connectionId: pin.connectionId,
            tagSelectors: selectors
        });

        if (row) {
            verified.push(toCandidate({ integrationId: row.integration_id, provider: row.provider, candidate: row.candidate }));
        } else {
            rejected.push(pin);
        }
    }

    return { verified, rejected };
}

export function resolveTenantConnections({
    matches,
    verifiedPins,
    rejectedPins,
    hasSelectors
}: {
    matches: AgentSessionIntegrationMatch[];
    verifiedPins: AgentSessionConnectionCandidate[];
    rejectedPins: AgentSessionPinnedConnection[];
    hasSelectors: boolean;
}): Result<AgentSessionResolvedConnections, AgentSessionConnectionResolutionError> {
    if (rejectedPins.length > 0) {
        return Err(hasSelectors ? pinnedNotMatchedError(rejectedPins, matches) : unknownPinnedConnectionError(rejectedPins));
    }

    const resolved: Record<string, AgentSessionResolvedConnection> = {};
    for (const pin of verifiedPins) {
        resolved[pin.integrationId] = toResolvedConnection(pin);
    }

    const ambiguous: AgentSessionAmbiguousConnectionsPayload['integrations'] = {};

    for (const match of matches) {
        if (resolved[match.integrationId]) {
            continue;
        }

        const [onlyCandidate] = match.candidates;
        if (match.matchCount > 1 || !onlyCandidate) {
            ambiguous[match.integrationId] = { match_count: match.matchCount, candidates: match.candidates.map(toCandidateReport) };
            continue;
        }

        resolved[match.integrationId] = toResolvedConnection(onlyCandidate);
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
    const selectors = connections.any.map((selector) => selector.tags);
    const matches = await listIntegrationMatches({ environmentId, selectors });
    const pins = await checkPinnedConnections({ environmentId, selectors, pinned: connections.pinned });

    return resolveTenantConnections({
        matches,
        verifiedPins: pins.verified,
        rejectedPins: pins.rejected,
        hasSelectors: selectors.length > 0
    });
}

type AgentSessionConnectionSelectorList = Tags[];

function pinnedNotMatchedError(rejected: AgentSessionPinnedConnection[], matches: AgentSessionIntegrationMatch[]): AgentSessionConnectionResolutionError {
    const byIntegration = new Map(matches.map((match) => [match.integrationId, match]));
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

function toCandidate({
    integrationId,
    provider,
    candidate
}: {
    integrationId: string;
    provider: string;
    candidate: ConnectionMatchCandidate;
}): AgentSessionConnectionCandidate {
    return {
        integrationId,
        provider,
        connectionId: candidate.connection_id,
        internalConnectionId: candidate.id,
        configId: candidate.config_id,
        tags: candidate.tags
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
