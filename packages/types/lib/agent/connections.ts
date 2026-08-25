import type { Tags } from '../db.js';

export interface AgentSessionConnectionSelector {
    readonly tags: Tags;
}

export interface AgentSessionPinnedConnection {
    readonly integrationId: string;
    readonly connectionId: string;
}

export interface AgentSessionTenantConnections {
    readonly any: AgentSessionConnectionSelector[];
    readonly pinned: AgentSessionPinnedConnection[];
}

export interface AgentSessionResolvedConnection {
    readonly integrationId: string;
    readonly provider: string;
    readonly connectionId: string;
    readonly internalConnectionId: number;
    readonly configId: number;
}

export type AgentSessionResolvedConnections = Record<string, AgentSessionResolvedConnection>;

export type AgentSessionConnectionResolutionErrorCode = 'ambiguous_connections' | 'pinned_connection_not_matched' | 'unknown_pinned_connection';

export interface AgentSessionConnectionCandidateReport {
    readonly connection_id: string;
    readonly tags: Tags;
}

export interface AgentSessionAmbiguousConnectionsPayload {
    readonly integrations: Record<
        string,
        {
            readonly match_count: number;
            readonly candidates: AgentSessionConnectionCandidateReport[];
        }
    >;
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
