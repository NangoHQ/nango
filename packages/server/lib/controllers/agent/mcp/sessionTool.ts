import { Err, metrics } from '@nangohq/utils';

import { handleMcpToolError, jsonContent, PublicMcpError } from '../../mcp/utils.js';

import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { AgentSession, AgentSessionMetaTools, DBEnvironment, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type * as z from 'zod/v4';

export interface AgentSessionMcpContext {
    account: DBTeam;
    environment: DBEnvironment;
    session: AgentSession;
}

/**
 * A meta tool the session puts in front of the agent. Unlike a Management MCP tool it carries no
 * scopes: a session token is already scoped to the toolset the session was created with, so what a
 * tool may reach is decided by the compiled toolset rather than by the credential.
 */
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
                return Err(new PublicMcpError(formatArgumentsError(tool.name, parsedArgs.error)));
            }

            return await tool.handler({ ...context, args: parsedArgs.data });
        }
    };
}

/**
 * Runs a tool call and renders it as an MCP result. Shared by the meta tools and by pinned tools,
 * which are called by name and so never reach a meta tool's handler.
 */
export async function callAgentSessionTool({
    name,
    accountId,
    run
}: {
    name: string;
    accountId: number;
    run: () => Promise<Result<unknown>>;
}): Promise<CallToolResult> {
    let result: Result<unknown>;
    try {
        result = await run();
    } catch (err) {
        metrics.increment(metrics.Types.MCP_TOOL_CALLS, 1, { accountId, mcp_type: 'agent_session', tool: name, outcome: 'error' });
        return handleMcpToolError(err, name);
    }

    metrics.increment(metrics.Types.MCP_TOOL_CALLS, 1, {
        accountId,
        mcp_type: 'agent_session',
        tool: name,
        outcome: result.isOk() ? 'success' : 'error'
    });

    if (result.isErr()) {
        return handleMcpToolError(result.error, name);
    }

    return jsonContent(result.value);
}

function formatArgumentsError(toolName: string, error: z.ZodError): string {
    const details = error.issues
        .map((issue) => {
            const path = issue.path.length > 0 ? issue.path.map(String).join('.') : 'arguments';
            return `${path}: ${issue.message}`;
        })
        .join('; ');

    return details ? `Invalid ${toolName} arguments: ${details}` : `Invalid ${toolName} arguments`;
}
