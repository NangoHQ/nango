import type { FunctionTagValue } from '../function/config.js';
import type { JSONSchema7 } from 'json-schema';

export type AgentSessionToolConnectionState = { readonly status: 'connected'; readonly connection_id: string } | { readonly status: 'not_connected' };

/** `schema` carries the arguments, `none` means there are none, `unavailable` means they could not be read. */
export type AgentSessionToolInput = { readonly kind: 'schema'; readonly schema: JSONSchema7 } | { readonly kind: 'none' } | { readonly kind: 'unavailable' };

/** A weaker match, listed without its input. A lead to search again on rather than a tool to call. */
export interface AgentSessionToolRelated {
    /** What to pass to nango_execute. Names are sanitised and clipped, so use it as given. */
    readonly tool: string;
    readonly integration: string;
    readonly description: string;
}

export interface AgentSessionToolMatch extends AgentSessionToolRelated {
    readonly input: AgentSessionToolInput;
    readonly tags?: Readonly<Record<string, FunctionTagValue>>;
}

export interface AgentSessionToolSearchQueryResult {
    readonly query: string;
    /** Only when there is something to say about this query in particular. */
    readonly guidance?: string;
    readonly matches: AgentSessionToolMatch[];
    readonly related: AgentSessionToolRelated[];
}

/** Stated once per integration the results name, rather than on every tool. */
export type AgentSessionToolSearchIntegrationState = 'connected' | 'not_connected';

export interface AgentSessionToolSearchResult {
    readonly guidance: string;
    readonly integrations: Record<string, AgentSessionToolSearchIntegrationState>;
    /** One entry per query, in the order the queries were sent. */
    readonly results: AgentSessionToolSearchQueryResult[];
}
