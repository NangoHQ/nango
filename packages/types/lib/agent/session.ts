import type { JsonObject } from 'type-fest';

export type AgentSessionResolvedConnections = JsonObject;
export type AgentSessionCompiledToolset = JsonObject;

export interface AgentSessionMetaTools {
    readonly nangoProxy: boolean;
    readonly nangoSearch: boolean;
    readonly nangoExecute: boolean;
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
