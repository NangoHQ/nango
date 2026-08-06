import { Err, getLogger } from '@nangohq/utils';

import { recordControlPlaneMcpAudit } from './audit.js';
import { PublicMcpError } from './utils.js';

import type { ControlPlaneMcpAuditContext } from './audit.js';
import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ApiKeyScope, AuditPolicy, AuditTarget, DBEnvironment, DBTeam, EndpointAudit, NoAudit } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type * as z from 'zod/v4';

const logger = getLogger('Server.ManagementMcpTool');

export interface ControlPlaneMcpContext {
    account: DBTeam;
    environment: DBEnvironment;
    grantedScopes: string[] | undefined;
    audit?: ControlPlaneMcpAuditContext | undefined;
}

export type ControlPlaneMcpSchema = AnySchema | z.ZodType;
export type ControlPlaneMcpRequiredScopes = { every: ApiKeyScope[] } | { anyOf: ApiKeyScope[] };

export interface ControlPlaneMcpTool<TResponse extends object = object> {
    name: string;
    description: string;
    inputSchema: ControlPlaneMcpSchema;
    outputSchema?: ControlPlaneMcpSchema;
    annotations?: ToolAnnotations;
    requiredScopes: ControlPlaneMcpRequiredScopes;
    audit: EndpointAudit;
    handler: (args: unknown, context: ControlPlaneMcpContext) => Promise<Result<TResponse>>;
}

type ControlPlaneMcpAuditedTool<TArgs, TResponse extends object> = AuditPolicy & {
    metadata?: ((context: ControlPlaneMcpContext & { args: TArgs }) => Record<string, unknown> | undefined) | undefined;
    targetFromOutput?: ((context: ControlPlaneMcpContext & { args: TArgs; output: TResponse }) => AuditTarget | AuditTarget[] | undefined) | undefined;
};

type ControlPlaneMcpToolAudit<TArgs, TResponse extends object> = NoAudit<string> | ControlPlaneMcpAuditedTool<TArgs, TResponse>;

type ControlPlaneMcpToolDefinition<TInputSchema extends z.ZodType, TResponse extends object> = Omit<
    ControlPlaneMcpTool<TResponse>,
    'audit' | 'handler' | 'inputSchema'
> & {
    inputSchema: TInputSchema;
    audit: ControlPlaneMcpToolAudit<z.output<TInputSchema>, TResponse>;
    handler: (context: ControlPlaneMcpContext & { args: z.output<TInputSchema> }) => Result<TResponse> | Promise<Result<TResponse>>;
};

export function defineControlPlaneMcpTool<TInputSchema extends z.ZodType, TResponse extends object>(
    tool: ControlPlaneMcpToolDefinition<TInputSchema, TResponse>
): ControlPlaneMcpTool<TResponse> {
    return {
        ...tool,
        async handler(args, context) {
            const parsedArgs = tool.inputSchema.safeParse(args ?? {});
            if (!parsedArgs.success) {
                recordToolAudit({ tool, context, outcome: 'failure' });
                return Err(new PublicMcpError(formatArgumentsError(tool.name, parsedArgs.error)));
            }

            const handlerContext = { ...context, args: parsedArgs.data };
            try {
                const result = await tool.handler(handlerContext);
                recordToolAudit({
                    tool,
                    context,
                    args: parsedArgs.data,
                    outcome: result.isOk() ? 'success' : 'failure',
                    ...(result.isOk() ? { output: result.value } : {})
                });
                return result;
            } catch (err) {
                recordToolAudit({ tool, context, args: parsedArgs.data, outcome: 'failure' });
                throw err;
            }
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
    tool: ControlPlaneMcpToolDefinition<TInputSchema, TResponse>;
    context: ControlPlaneMcpContext;
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
        recordControlPlaneMcpAudit({
            account: context.account,
            environment: context.environment,
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
