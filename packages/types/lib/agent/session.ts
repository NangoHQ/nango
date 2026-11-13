import type { Tags } from '../db.js';
import type { AgentSessionResolvedConnections } from './connections.js';
import type { AgentSessionCompiledToolset } from './toolset.js';

/**
 * `tags` are stamped on the connection the agent has created, on top of the reserved tag that binds
 * it to the session, so it also matches the selectors a later session for the same tenant will use.
 */
export interface AgentSessionCreateConnectionConfig {
    readonly enabled: boolean;
    readonly tags: Tags;
}

export interface AgentSessionMetaTools {
    readonly nangoToolSearch: boolean;
    readonly nangoExecute: boolean;
    readonly nangoProxy: boolean;
    readonly nangoCreateConnection: AgentSessionCreateConnectionConfig;
}

/** Nango's own tools, as opposed to the integration tools an account deploys. */
export type AgentSessionMetaTool = 'nango_execute' | 'nango_proxy' | 'nango_tool_search' | 'nango_create_connection';

/** One ranked tool, as the search returned it. Confidence runs from 0, nothing matched, to 1. */
export interface AgentSessionToolSearchHit {
    tool_name: string;
    /** The name the agent was given for it, which collisions make impossible to derive afterwards. */
    tool_slug: string;
    integration_id: string;
    confidence: number;
}

export type AgentSessionEndedReason = 'terminated' | 'expired';

export interface AgentSession {
    readonly id: string;
    readonly environmentId: number;
    readonly accountId: number;
    readonly resolvedConnections: AgentSessionResolvedConnections;
    readonly compiledToolset: AgentSessionCompiledToolset;
    readonly metaTools: AgentSessionMetaTools;
    readonly expiresAt: Date;
    readonly endedAt: Date | null;
    readonly endedReason: AgentSessionEndedReason | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}
