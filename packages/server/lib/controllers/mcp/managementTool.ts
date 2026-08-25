import { Err, getLogger, metrics } from '@nangohq/utils';

import { recordManagementMcpAudit } from './audit.js';
import { PublicMcpError } from './utils.js';

import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ApiKeyScope, AuditAttribution, AuditPolicy, AuditTarget, DBEnvironment, DBPlan, DBTeam, EndpointAudit, NoAudit } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type * as z from 'zod/v4';

const logger = getLogger('Server.ManagementMcpTool');

export interface ManagementMcpContext {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
    grantedScopes: string[] | undefined;
    audit?: AuditAttribution | undefined;
}

export type ManagementMcpSchema = AnySchema | z.ZodType;
export type ManagementMcpRequiredScopes = { none: true } | { every: ApiKeyScope[] } | { anyOf: ApiKeyScope[] };

export interface ManagementMcpTool<TResponse extends object = object> {
    name: string;
    description: string;
    inputSchema: ManagementMcpSchema;
    outputSchema?: ManagementMcpSchema;
    annotations?: ToolAnnotations;
    requiredScopes: ManagementMcpRequiredScopes;
    audit: EndpointAudit;
    handler: (args: unknown, context: ManagementMcpContext) => Promise<Result<TResponse>>;
}

type ManagementMcpAuditedTool<TArgs, TResponse extends object> = AuditPolicy & {
    metadata?: ((context: ManagementMcpContext & { args: TArgs }) => Record<string, unknown> | undefined) | undefined;
    targetFromOutput?: ((context: ManagementMcpContext & { args: TArgs; output: TResponse }) => AuditTarget | AuditTarget[] | undefined) | undefined;
};

type ManagementMcpToolAudit<TArgs, TResponse extends object> = NoAudit<string> | ManagementMcpAuditedTool<TArgs, TResponse>;

type ManagementMcpToolDefinition<TInputSchema extends z.ZodType, TResponse extends object> = Omit<
    ManagementMcpTool<TResponse>,
    'audit' | 'handler' | 'inputSchema'
> & {
    inputSchema: TInputSchema;
    audit: ManagementMcpToolAudit<z.output<TInputSchema>, TResponse>;
    handler: (context: ManagementMcpContext & { args: z.output<TInputSchema> }) => Result<TResponse> | Promise<Result<TResponse>>;
};

export function defineManagementMcpTool<TInputSchema extends z.ZodType, TResponse extends object>(
    tool: ManagementMcpToolDefinition<TInputSchema, TResponse>
): ManagementMcpTool<TResponse> {
    return {
        ...tool,
        async handler(args, context) {
            const parsedArgs = tool.inputSchema.safeParse(args ?? {});
            if (!parsedArgs.success) {
                recordToolAudit({ tool, context, outcome: 'failure' });
                return Err(new PublicMcpError(formatArgumentsError(tool.name, parsedArgs.error)));
            }

            const handlerContext = { ...context, args: parsedArgs.data };
            let result: Result<TResponse>;
            try {
                result = await tool.handler(handlerContext);
            } catch (err) {
                metrics.increment(metrics.Types.MCP_TOOL_CALLS, 1, { mcp_type: 'management', tool: tool.name, outcome: 'error' });
                recordToolAudit({ tool, context, args: parsedArgs.data, outcome: 'failure' });
                throw err;
            }

            metrics.increment(metrics.Types.MCP_TOOL_CALLS, 1, {
                mcp_type: 'management',
                tool: tool.name,
                outcome: result.isOk() ? 'success' : 'error'
            });
            recordToolAudit({
                tool,
                context,
                args: parsedArgs.data,
                outcome: result.isOk() ? 'success' : 'failure',
                ...(result.isOk() ? { output: result.value } : {})
            });
            return result;
        }
    };
}

function recordToolAudit<TInputSchema extends z.ZodType, TResponse extends object>({
    tool,
    context,
    args,
    output,
    outcome
}: {
    tool: ManagementMcpToolDefinition<TInputSchema, TResponse>;
    context: ManagementMcpContext;
    args?: z.output<TInputSchema> | undefined;
    output?: TResponse | undefined;
    outcome: 'success' | 'failure';
}): void {
    if (tool.audit.kind === 'no-audit' || !context.audit) {
        return;
    }

    try {
        const typedContext = args === undefined ? undefined : { ...context, args };
        const metadata = typedContext && tool.audit.metadata ? tool.audit.metadata(typedContext) : undefined;
        const target = typedContext && output && tool.audit.targetFromOutput ? tool.audit.targetFromOutput({ ...typedContext, output }) : undefined;
        recordManagementMcpAudit({
            account: context.account,
            environment: context.environment,
            plan: context.plan,
            auditContext: context.audit,
            policy: tool.audit,
            outcome,
            target,
            metadata
        });
    } catch {
        // Audit resolution must never change a tool's result or leak the submitted arguments into logs.
        logger.error('Failed to resolve Management MCP audit data', { toolName: tool.name });
    }
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
