import type { ToolAnnotations } from '@modelcontextprotocol/server';
import type { AgentSessionMetaTools } from '@nangohq/types';
import type * as z from 'zod/v4';

/** The MCP limit on a tool name, which is what a session tool's slug is clipped to fit. */
export const MAX_TOOL_NAME_LENGTH = 64;

export const TOOLS_PAGE_SIZE = 50;

export interface AgentSessionCallableTool {
    integrationId: string;
    name: string;
    description: string;
    /** A searchable tool answers to its name too, so being callable does not make a tool pinned. */
    pinned: boolean;
}

/**
 * Every tool the session can run, keyed by the name it answers to. Built once per request, so a tool
 * resolves a name without rebuilding the session's naming.
 */
export type AgentSessionCallableTools = ReadonlyMap<string, AgentSessionCallableTool>;

// A meta tool the session puts in front of the agent
export interface AgentSessionToolDefinition {
    name: string;
    description: string;
    inputSchema: z.ZodType;
    /** Declared only by a tool whose result is an object. nango_execute returns whatever an action returns. */
    outputSchema?: z.ZodType;
    annotations?: ToolAnnotations;
    isEnabled: (metaTools: AgentSessionMetaTools) => boolean;
}
