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
 * Chooses which of an integration's matched connections to use. Selectors filter first and a pin
 * picks from what they matched, so a pin can never reach a connection the selectors excluded. A
 * tenant with no selectors at all applies no tag filter, which is how a customer who resolves
 * connections themselves pins ids directly.
 */
export interface AgentSessionPinnedConnection {
    readonly integrationId: string;
    readonly connectionId: string;
}

/** At least one of `any` or `pinned` is always present. An empty `any` applies no tag filter. */
export interface AgentSessionTenantConnections {
    readonly any: AgentSessionConnectionSelector[];
    readonly pinned: AgentSessionPinnedConnection[];
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

export type AgentSessionConnectionResolutionErrorCode =
    | 'ambiguous_connections'
    | 'pinned_connection_not_matched'
    | 'selector_too_broad'
    | 'unknown_pinned_connection';

/** Candidate as named back to the caller, so it can narrow the selectors or pin one of these. */
export interface AgentSessionConnectionCandidateReport {
    readonly connection_id: string;
    readonly tags: Tags;
}

export interface AgentSessionAmbiguousConnectionsPayload {
    readonly integrations: Record<string, { readonly candidates: AgentSessionConnectionCandidateReport[] }>;
}

export interface AgentSessionUnknownPinnedConnectionsPayload {
    readonly pinned: {
        readonly integration_id: string;
        readonly connection_id: string;
    }[];
}

export interface AgentSessionPinnedConnectionNotMatchedPayload {
    readonly pinned: {
        readonly integration_id: string;
        readonly connection_id: string;
        readonly candidates: AgentSessionConnectionCandidateReport[];
    }[];
}
