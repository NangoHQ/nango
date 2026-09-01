/**
 * `allow` absent means every tool on the integration. `allow` present makes the
 * integration an allowlist. `deny` always subtracts from whatever `allow` gave.
 */
export interface AgentSessionIntegrationPolicy {
    readonly allow: '*' | readonly string[];
    readonly deny: readonly string[];
}

export type AgentSessionToolsetPolicy = '*' | Readonly<Record<string, AgentSessionIntegrationPolicy>>;

export type AgentSessionPinnedTools = Readonly<Record<string, readonly string[]>>;

export interface AgentSessionCompiledTool {
    readonly name: string;
    readonly description: string;
}

export interface AgentSessionCompiledIntegration {
    readonly provider: string;
    readonly pinned: AgentSessionCompiledTool[];
    readonly searchable: AgentSessionCompiledTool[];
}

export type AgentSessionCompiledToolset = Record<string, AgentSessionCompiledIntegration>;

export type AgentSessionToolsetCompilationErrorCode = 'unknown_integration' | 'unknown_tool' | 'unsupported_function_type' | 'tool_not_in_toolset';

export interface AgentSessionUnknownIntegrationsPayload {
    readonly integrations: string[];
}

export interface AgentSessionUnknownToolsPayload {
    readonly tools: {
        readonly integration_id: string;
        readonly tool: string;
    }[];
}

export interface AgentSessionUnsupportedFunctionTypesPayload {
    readonly tools: {
        readonly integration_id: string;
        readonly tool: string;
        readonly type: string;
    }[];
}

export interface AgentSessionToolsNotInToolsetPayload {
    readonly pinned: {
        readonly integration_id: string;
        readonly tool: string;
    }[];
}
