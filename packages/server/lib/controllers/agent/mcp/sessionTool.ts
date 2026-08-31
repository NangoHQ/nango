import { Err, metrics } from '@nangohq/utils';

import { formatMcpArgumentsError, handleMcpToolError, jsonContent, PublicMcpError } from '../../mcp/utils.js';

import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { AgentSession, AgentSessionMetaTools, DBEnvironment, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type * as z from 'zod/v4';

/** The MCP limit on a tool name, which is what a session tool's slug is clipped to fit. */
export const MAX_TOOL_NAME_LENGTH = 64;

export interface AgentSessionCallableTool {
    integrationId: string;
    name: string;
    description: string;
}

/**
 * Every tool the session can run, keyed by the name it answers to. Built once per request, so a tool
 * resolves a name without rebuilding the session's naming.
 */
export type AgentSessionCallableTools = ReadonlyMap<string, AgentSessionCallableTool>;

export interface AgentSessionMcpContext {
    account: DBTeam;
    environment: DBEnvironment;
    session: AgentSession;
    callable: AgentSessionCallableTools;
}

// A meta tool the session puts in front of the agent
export interface AgentSessionMcpTool {
    name: string;
    description: string;
    inputSchema: z.ZodType;
    annotations?: ToolAnnotations;
    isEnabled: (metaTools: AgentSessionMetaTools) => boolean;
    handler: (args: unknown, context: AgentSessionMcpContext) => Promise<Result<unknown>>;
}

type AgentSessionMcpToolDefinition<TInputSchema extends z.ZodType> = Omit<AgentSessionMcpTool, 'handler' | 'inputSchema'> & {
    inputSchema: TInputSchema;
    handler: (context: AgentSessionMcpContext & { args: z.output<TInputSchema> }) => Result<unknown> | Promise<Result<unknown>>;
};

export function defineAgentSessionMcpTool<TInputSchema extends z.ZodType>(tool: AgentSessionMcpToolDefinition<TInputSchema>): AgentSessionMcpTool {
    return {
        ...tool,
        async handler(args, context) {
            const parsedArgs = tool.inputSchema.safeParse(args ?? {});
            if (!parsedArgs.success) {
                return Err(new PublicMcpError(formatMcpArgumentsError(tool.name, parsedArgs.error)));
            }

            return await tool.handler({ ...context, args: parsedArgs.data });
        }
    };
}

export async function callAgentSessionTool({
    metric,
    accountId,
    run
}: {
    metric: string;
    accountId: number;
    run: () => Promise<Result<unknown>>;
}): Promise<CallToolResult> {
    let result: Result<unknown>;
    try {
        result = await run();
    } catch (err) {
        metrics.increment(metrics.Types.MCP_TOOL_CALLS, 1, { accountId, mcp_type: 'agent_session', tool: metric, outcome: 'error' });
        return handleMcpToolError(err, metric);
    }

    metrics.increment(metrics.Types.MCP_TOOL_CALLS, 1, {
        accountId,
        mcp_type: 'agent_session',
        tool: metric,
        outcome: result.isOk() ? 'success' : 'error'
    });

    if (result.isErr()) {
        return handleMcpToolError(result.error, metric);
    }

    return jsonContent(result.value ?? null);
}
