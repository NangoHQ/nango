import type { JSONSchema7 } from 'json-schema';

/**
 * An integration is connected when the session resolved a connection for it. A session can carry
 * tools for an integration it never resolved, so an unconnected tool is still searchable and still
 * described, it just fails when it is called.
 */
export type AgentSessionToolConnectionState = { readonly status: 'connected'; readonly connection_id: string } | { readonly status: 'not_connected' };

export interface AgentSessionToolMatch {
    readonly integration: string;
    readonly provider: string;
    readonly tool: string;
    readonly description: string;
    readonly connection: AgentSessionToolConnectionState;
    /** Set when the tool is already in the agent's tool list, holding the name it is listed under. */
    readonly listed_as?: string;
    /** Only on a best match. A soft match is a lead to narrow down, not something to call yet. */
    readonly input_schema?: JSONSchema7;
}

export interface AgentSessionToolSearchResult {
    readonly guidance: string;
    readonly matches: AgentSessionToolMatch[];
    readonly related: AgentSessionToolMatch[];
}
