import { z } from 'zod';

import { connectionService, connectionTagsSchema } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema } from '../helpers/validation.js';

import type {
    AgentSessionAmbiguousConnectionsPayload,
    AgentSessionConnectionCandidate,
    AgentSessionConnectionCandidateReport,
    AgentSessionConnectionDisambiguation,
    AgentSessionConnectionResolutionErrorCode,
    AgentSessionConnectionSelector,
    AgentSessionDisambiguationIssueReason,
    AgentSessionInvalidDisambiguationPayload,
    AgentSessionResolvedConnection,
    AgentSessionResolvedConnections,
    AgentSessionTenantConnections
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export const MAX_SELECTORS = 10;
export const MAX_DISAMBIGUATION_PINS = 50;

/**
 * A tenant selector is expected to match a handful of connections, one per integration. Reading one
 * row past the limit turns a pathologically broad selector into an error instead of a truncated
 * candidate list, which could otherwise hide the second candidate of an integration and resolve a
 * connection the caller never disambiguated.
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
 * Public shape of `tenant.connections`. `any` is an OR between selectors, and the constraints
 * within one selector are matched together.
 */
export const agentSessionTenantConnectionsSchema = z
    .strictObject({
        any: z.array(selectorSchema).min(1).max(MAX_SELECTORS),
        disambiguation: z
            .array(
                z.strictObject({
                    integration_id: providerConfigKeySchema,
                    connection_id: connectionIdSchema
                })
            )
            .max(MAX_DISAMBIGUATION_PINS)
            .optional()
    })
    .transform(
        (connections): AgentSessionTenantConnections => ({
            any: connections.any.map((selector) => ({
                tags: selector.tags,
                endUserId: selector.end_user_id,
                endUserOrganizationId: selector.end_user_organization_id
            })),
            disambiguation: (connections.disambiguation ?? []).map((pin) => ({
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
            byInternalId.set(row.connection.id, {
                integrationId: row.integration_id,
                provider: row.provider,
                connectionId: row.connection.connection_id,
                internalConnectionId: row.connection.id,
                configId: row.connection.config_id,
                tags: row.connection.tags
            });
        }
    }

    return Ok([...byInternalId.values()]);
}

/**
 * Pure resolution: one connection per integration, or a report naming the candidates the caller
 * has to choose between. Zero matches is not an error, the integration is simply absent from the
 * result and the session exposes it as not connected.
 */
export function resolveTenantConnections({
    candidates,
    disambiguation
}: {
    candidates: AgentSessionConnectionCandidate[];
    disambiguation: AgentSessionConnectionDisambiguation[];
}): Result<AgentSessionResolvedConnections, AgentSessionConnectionResolutionError> {
    const candidatesByIntegration = new Map<string, AgentSessionConnectionCandidate[]>();
    for (const candidate of candidates) {
        const forIntegration = candidatesByIntegration.get(candidate.integrationId) ?? [];
        forIntegration.push(candidate);
        candidatesByIntegration.set(candidate.integrationId, forIntegration);
    }

    const pins = new Map<string, AgentSessionConnectionCandidate>();
    const issues: AgentSessionInvalidDisambiguationPayload['disambiguation'] = [];

    for (const pin of disambiguation) {
        const forIntegration = candidatesByIntegration.get(pin.integrationId) ?? [];
        const pinned = matchPin({ pin, candidates: forIntegration, alreadyPinned: pins.has(pin.integrationId) });

        if ('reason' in pinned) {
            issues.push({
                integration_id: pin.integrationId,
                connection_id: pin.connectionId,
                reason: pinned.reason,
                candidates: forIntegration.map(toCandidateReport)
            });
            continue;
        }

        pins.set(pin.integrationId, pinned.candidate);
    }

    if (issues.length > 0) {
        const payload: AgentSessionInvalidDisambiguationPayload = { disambiguation: issues };
        return Err(
            new AgentSessionConnectionResolutionError({
                code: 'invalid_disambiguation',
                message: `${issues.length} pinned ${issues.length === 1 ? 'connection does' : 'connections do'} not narrow a matched integration. A pinned connection must be one the connection selectors already matched.`,
                payload: { ...payload }
            })
        );
    }

    const resolved: Record<string, AgentSessionResolvedConnection> = {};
    const ambiguous: Record<string, { candidates: AgentSessionConnectionCandidateReport[] }> = {};

    for (const [integrationId, forIntegration] of candidatesByIntegration) {
        const pinned = pins.get(integrationId);
        if (pinned) {
            resolved[integrationId] = toResolvedConnection(pinned);
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
    const candidates = await listTenantConnectionCandidates({ environmentId, selectors: connections.any });
    if (candidates.isErr()) {
        return Err(candidates.error);
    }

    return resolveTenantConnections({ candidates: candidates.value, disambiguation: connections.disambiguation });
}

function matchPin({
    pin,
    candidates,
    alreadyPinned
}: {
    pin: AgentSessionConnectionDisambiguation;
    candidates: AgentSessionConnectionCandidate[];
    alreadyPinned: boolean;
}): { candidate: AgentSessionConnectionCandidate } | { reason: AgentSessionDisambiguationIssueReason } {
    if (alreadyPinned) {
        return { reason: 'duplicate_pin' };
    }
    if (candidates.length === 0) {
        return { reason: 'no_candidates' };
    }

    const candidate = candidates.find((candidate) => candidate.connectionId === pin.connectionId);
    if (!candidate) {
        return { reason: 'connection_not_a_candidate' };
    }

    return { candidate };
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
