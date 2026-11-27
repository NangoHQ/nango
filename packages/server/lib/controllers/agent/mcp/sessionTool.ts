import tracer from 'dd-trace';

import { Err, metrics } from '@nangohq/utils';

import { measureAgentSessionToolCall } from '../../../services/agentSessionAnalytics.service.js';
import { formatMcpArgumentsError, InternalMcpError, jsonContent, jsonStructuredContent, mcpToolError, PublicMcpError } from '../../mcp/utils.js';

import type { AgentSessionCallableTools, AgentSessionToolDefinition } from '../../../services/agentSessionToolCatalog.service/index.js';
import type { CallToolResult } from '@modelcontextprotocol/server';
import type { AgentSession, DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Span } from 'dd-trace';
import type * as z from 'zod/v4';

const MAX_TRACKED_INVALID_ARGUMENTS = 10;

/**
 * What an MCP server tool returned, already a valid tool result, so it reaches the agent as the
 * server shaped it instead of being serialised again as JSON.
 */
export class RemoteToolResult {
    constructor(public readonly result: CallToolResult) {}
}

export interface AgentSessionMcpContext {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
    session: AgentSession;
    callable: AgentSessionCallableTools;
}

export interface AgentSessionMcpTool extends AgentSessionToolDefinition {
    handler: (args: unknown, context: AgentSessionMcpContext) => Promise<Result<unknown>>;
}

type AgentSessionMcpToolConfig<TInputSchema extends z.ZodType> = Omit<AgentSessionToolDefinition, 'inputSchema'> & {
    inputSchema: TInputSchema;
    onInvalidArguments?: (context: AgentSessionMcpContext, invalid: { args: unknown; error: z.ZodError }) => void;
    handler: (context: AgentSessionMcpContext & { args: z.output<TInputSchema> }) => Result<unknown> | Promise<Result<unknown>>;
};

export function makeAgentSessionMcpTool<TInputSchema extends z.ZodType>(tool: AgentSessionMcpToolConfig<TInputSchema>): AgentSessionMcpTool {
    return {
        ...tool,
        async handler(args, context) {
            const parsedArgs = tool.inputSchema.safeParse(args ?? {});
            if (!parsedArgs.success) {
                tool.onInvalidArguments?.(context, { args, error: parsedArgs.error });
                return Err(
                    new PublicMcpError(`${formatMcpArgumentsError(tool.name, parsedArgs.error)}. Correct the arguments and call it again.`, {
                        code: 'invalid_input'
                    })
                );
            }

            return await tool.handler({ ...context, args: parsedArgs.data });
        }
    };
}

/**
 * The top level argument and the zod issue code only. The issue message can quote what the agent sent,
 * and a deeper path can be a key that carries data, like a query parameter name.
 */
export function invalidArgumentsOf(error: z.ZodError): string[] {
    const invalid = error.issues.flatMap((issue) => {
        if (issue.code === 'unrecognized_keys' && issue.path.length === 0) {
            return issue.keys.map((key) => `${key}: unrecognized_key`);
        }
        return [`${issue.path.length > 0 ? String(issue.path[0]) : 'arguments'}: ${issue.code}`];
    });
    return [...new Set(invalid)].slice(0, MAX_TRACKED_INVALID_ARGUMENTS);
}

interface AgentSessionToolCall {
    metric: string;
    accountId: number;
    structured?: boolean;
    run: () => Promise<Result<unknown>>;
}

export async function callAgentSessionTool(call: AgentSessionToolCall): Promise<CallToolResult> {
    return await measureAgentSessionToolCall(async () => await runAgentSessionTool(call));
}

async function runAgentSessionTool({ metric, accountId, structured = false, run }: AgentSessionToolCall): Promise<CallToolResult> {
    return await tracer.trace<Promise<CallToolResult>>('server.mcp.agentSession.tool', async (span: Span) => {
        span.setTag('nango.accountId', accountId).setTag('nango.toolName', metric);

        let result: Result<unknown>;
        try {
            result = await run();
        } catch (err) {
            metrics.increment(metrics.Types.MCP_TOOL_CALLS, 1, { accountId, mcp_type: 'agent_session', tool: metric, outcome: 'error' });
            return handleAgentSessionToolError(err, span);
        }

        const failed = result.isErr() || (result.value instanceof RemoteToolResult && result.value.result.isError === true);
        metrics.increment(metrics.Types.MCP_TOOL_CALLS, 1, {
            accountId,
            mcp_type: 'agent_session',
            tool: metric,
            outcome: failed ? 'error' : 'success'
        });

        if (result.isErr()) {
            return handleAgentSessionToolError(result.error, span);
        }

        if (result.value instanceof RemoteToolResult) {
            return result.value.result;
        }

        // structuredContent has to be a JSON object, and only a tool that declared an output schema
        // promises one. Anything else falls back to plain content rather than rendering an invalid result.
        return structured && isJsonObject(result.value) ? jsonStructuredContent(result.value) : jsonContent(result.value ?? null);
    });
}

function isJsonObject(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function handleAgentSessionToolError(err: unknown, span: Span): CallToolResult {
    if (err instanceof PublicMcpError) {
        return mcpToolError(err.message, { code: err.code, integrationId: err.integrationId });
    }

    if (!(err instanceof InternalMcpError)) {
        span.setTag('nango.error', err);
    }

    return mcpToolError('The tool could not be run. Trying once more is reasonable, and tell the user if it keeps failing.', {
        code: 'internal_error'
    });
}
