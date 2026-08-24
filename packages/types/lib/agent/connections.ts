import type { Tags } from '../db.js';

/**
 * One clause of `tenant.connections.any`. Every constraint on a selector is matched together,
 * so a selector with tags and an end user matches connections satisfying all of them.
 */
export interface AgentSessionConnectionSelector {
    readonly tags?: Tags | undefined;
    readonly endUserId?: string | undefined;
    readonly endUserOrganizationId?: string | undefined;
}

/**
 * Breaks a tie when one integration matched several connections. A pin can only narrow the
 * selectors: the connection it names must already be a candidate.
 */
export interface AgentSessionConnectionDisambiguation {
    readonly integrationId: string;
    readonly connectionId: string;
}

export interface AgentSessionTenantConnections {
    readonly any: AgentSessionConnectionSelector[];
    readonly disambiguation: AgentSessionConnectionDisambiguation[];
}

/** A connection matching at least one selector, before cardinality is decided. */
export interface AgentSessionConnectionCandidate {
    readonly integrationId: string;
    readonly provider: string;
    readonly connectionId: string;
    readonly internalConnectionId: number;
    readonly configId: number;
    readonly tags: Tags;
}

/**
 * The one connection an integration's tools run against. The internal id is what execution must
 * use: a deleted external connection id can be reused by a row that never matched the selectors.
 */
export interface AgentSessionResolvedConnection {
    readonly integrationId: string;
    readonly provider: string;
    readonly connectionId: string;
    readonly internalConnectionId: number;
    readonly configId: number;
}

/** Keyed by integration id, holding exactly one connection each. */
export type AgentSessionResolvedConnections = Record<string, AgentSessionResolvedConnection>;

export type AgentSessionConnectionResolutionErrorCode = 'ambiguous_connections' | 'invalid_disambiguation' | 'selector_too_broad';

/** Candidate as named back to the caller, so it can narrow the selectors or pin one of these. */
export interface AgentSessionConnectionCandidateReport {
    readonly connection_id: string;
    readonly tags: Tags;
}

export interface AgentSessionAmbiguousConnectionsPayload {
    readonly integrations: Record<string, { readonly candidates: AgentSessionConnectionCandidateReport[] }>;
}

export type AgentSessionDisambiguationIssueReason = 'no_candidates' | 'connection_not_a_candidate' | 'duplicate_pin';

export interface AgentSessionInvalidDisambiguationPayload {
    readonly disambiguation: {
        readonly integration_id: string;
        readonly connection_id: string;
        readonly reason: AgentSessionDisambiguationIssueReason;
        readonly candidates: AgentSessionConnectionCandidateReport[];
    }[];
}
