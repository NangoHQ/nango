import type { JSONSchema7 } from 'json-schema';

export type AgentSessionToolConnectionState = { readonly status: 'connected'; readonly connection_id: string } | { readonly status: 'not_connected' };

/** `object` carries the arguments, `none` means there are none, `unavailable` means they could not be read. */
export type AgentSessionToolInput = { readonly kind: 'object'; readonly schema: JSONSchema7 } | { readonly kind: 'none' } | { readonly kind: 'unavailable' };

export interface AgentSessionToolMatch {
    readonly integration: string;
    readonly provider: string;
    readonly tool: string;
    readonly description: string;
    readonly connection: AgentSessionToolConnectionState;
    readonly listed_as?: string;
    /** Only on a best match. A soft match is a lead to narrow down, not something to call yet. */
    readonly input?: AgentSessionToolInput;
}

export interface AgentSessionToolSearchResult {
    readonly guidance: string;
    readonly matches: AgentSessionToolMatch[];
    readonly related: AgentSessionToolMatch[];
}
