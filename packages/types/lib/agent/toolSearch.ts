import type { JSONSchema7 } from 'json-schema';

export type AgentSessionToolConnectionState = { readonly status: 'connected'; readonly connection_id: string } | { readonly status: 'not_connected' };

/** `schema` carries the arguments, `none` means there are none, `unavailable` means they could not be read. */
export type AgentSessionToolInput = { readonly kind: 'schema'; readonly schema: JSONSchema7 } | { readonly kind: 'none' } | { readonly kind: 'unavailable' };

export interface AgentSessionToolMatch {
    /** What to pass to nango_execute. Names are sanitised and clipped, so use it as given. */
    readonly tool: string;
    readonly integration: string;
    readonly action: string;
    readonly provider: string;
    readonly description: string;
    /** Whether the tool is in the agent's tool list, under the same name. */
    readonly listed: boolean;
    readonly connection: AgentSessionToolConnectionState;
    /** Only on a best match. A soft match is a lead to narrow down, not something to call yet. */
    readonly input?: AgentSessionToolInput;
}

export interface AgentSessionToolSearchResult {
    readonly guidance: string;
    readonly matches: AgentSessionToolMatch[];
    readonly related: AgentSessionToolMatch[];
}
