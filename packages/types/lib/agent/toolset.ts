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

/** A tool the integration's MCP server listed when the session was created, as opposed to a deployed action. */
export interface AgentSessionMcpToolDefinition {
    readonly inputSchema: Record<string, unknown>;
    readonly annotations?: Record<string, unknown>;
}

export interface AgentSessionCompiledTool {
    readonly name: string;
    readonly description: string;
    readonly mcp?: AgentSessionMcpToolDefinition;
}

/** `unavailable` means the MCP server could not be listed, so the session carries none of its tools. */
export type AgentSessionMcpServerStatus = 'available' | 'unavailable';

export interface AgentSessionCompiledIntegration {
    readonly provider: string;
    readonly pinned: AgentSessionCompiledTool[];
    readonly searchable: AgentSessionCompiledTool[];
    readonly mcpServer?: AgentSessionMcpServerStatus;
}

export type AgentSessionCompiledToolset = Record<string, AgentSessionCompiledIntegration>;

export interface AgentSessionToolNames {
    readonly provider: string;
    readonly pinned: string[];
    readonly searchable: string[];
}

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
