import { Err, getLogger, metrics } from '@nangohq/utils';

import { recordManagementMcpAudit } from './audit.js';
import { formatMcpArgumentsError, PublicMcpError } from './utils.js';

import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type {
    ApiKeyScope,
    AuditActionOf,
    AuditAttribution,
    AuditMetadataFor,
    AuditPolicy,
    AuditResource,
    AuditScope,
    AuditTarget,
    DBEnvironment,
    DBPlan,
    DBTeam,
    EndpointAudit,
    NoAudit
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type * as z from 'zod/v4';

const logger = getLogger('Server.ManagementMcpTool');

export interface ManagementMcpContext {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
    grantedScopes: string[] | undefined;
    customerApiKeyId?: number | undefined;
    audit?: AuditAttribution | undefined;
}

export type ManagementMcpSchema = AnySchema | z.ZodType;
export type ManagementMcpRequiredScopes = { none: true } | { every: ApiKeyScope[] } | { anyOf: ApiKeyScope[] };

type DynamicManagementMcpAudit = {
    kind: 'dynamic-audit';
    resolvePolicy: (args: unknown, context: ManagementMcpContext) => AuditPolicy | undefined;
};

export interface ManagementMcpTool<TResponse extends object = object> {
    name: string;
    description: string;
    inputSchema: ManagementMcpSchema;
    outputSchema?: ManagementMcpSchema;
    annotations?: ToolAnnotations;
    requiredScopes: ManagementMcpRequiredScopes;
    audit: EndpointAudit | DynamicManagementMcpAudit;
    handler: (args: unknown, context: ManagementMcpContext) => Promise<Result<TResponse>>;
}

// One member per resource.action, so a tool's declared policy picks the member whose metadata type
// matches — the same check an audited endpoint gets. A bare `AuditPolicy` would widen resource and action
// to the whole vocabulary, which is what left MCP metadata as an unchecked bag.
type ManagementMcpAuditedTool<TArgs, TResponse extends object> = {
    [R in AuditResource]: {
        [A in AuditActionOf<R>]: AuditPolicy<R, A, AuditScope> & {
            metadata?: ((context: ManagementMcpContext & { args: TArgs }) => AuditMetadataFor<R, A> | undefined) | undefined;
            targetFromOutput?: ((context: ManagementMcpContext & { args: TArgs; output: TResponse }) => AuditTarget | AuditTarget[] | undefined) | undefined;
        };
    }[AuditActionOf<R>];
}[AuditResource];

type DynamicManagementMcpAuditedTool<TArgs, TResponse extends object> = Omit<ManagementMcpAuditedTool<TArgs, TResponse>, keyof AuditPolicy> & {
    kind: 'dynamic-audit';
    policy: (context: ManagementMcpContext & { args: unknown }) => AuditPolicy | undefined;
};

type ManagementMcpToolAudit<TArgs, TResponse extends object> =
    | NoAudit<string>
    | ManagementMcpAuditedTool<TArgs, TResponse>
    | DynamicManagementMcpAuditedTool<TArgs, TResponse>;

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
    const audit = tool.audit;
    const resolvedAudit: ManagementMcpTool<TResponse>['audit'] =
        audit.kind === 'dynamic-audit'
            ? {
                  kind: 'dynamic-audit',
                  resolvePolicy: (args, context) => audit.policy({ ...context, args })
              }
            : audit;

    return {
        ...tool,
        audit: resolvedAudit,
        async handler(args, context) {
            const parsedArgs = tool.inputSchema.safeParse(args ?? {});
            if (!parsedArgs.success) {
                recordToolAudit({ tool, context, rawArgs: args, outcome: 'failure' });
                return Err(new PublicMcpError(formatMcpArgumentsError(tool.name, parsedArgs.error)));
            }

            const handlerContext = { ...context, args: parsedArgs.data };
            let result: Result<TResponse>;
            try {
                result = await tool.handler(handlerContext);
            } catch (err) {
                metrics.increment(metrics.Types.MCP_TOOL_CALLS, 1, {
                    accountId: context.account.id,
                    mcp_type: 'management',
                    tool: tool.name,
                    outcome: 'error'
                });
                recordToolAudit({ tool, context, rawArgs: args, args: parsedArgs.data, outcome: 'failure' });
                throw err;
            }

            metrics.increment(metrics.Types.MCP_TOOL_CALLS, 1, {
                accountId: context.account.id,
                mcp_type: 'management',
                tool: tool.name,
                outcome: result.isOk() ? 'success' : 'error'
            });
            recordToolAudit({
                tool,
                context,
                rawArgs: args,
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
    rawArgs,
    args,
    output,
    outcome
}: {
    tool: ManagementMcpToolDefinition<TInputSchema, TResponse>;
    context: ManagementMcpContext;
    rawArgs: unknown;
    args?: z.output<TInputSchema> | undefined;
    output?: TResponse | undefined;
    outcome: 'success' | 'failure';
}): void {
    if (tool.audit.kind === 'no-audit' || !context.audit) {
        return;
    }

    try {
        const typedContext = args === undefined ? undefined : { ...context, args };
        const policy = tool.audit.kind === 'dynamic-audit' ? tool.audit.policy({ ...context, args: rawArgs }) : tool.audit;
        if (!policy) {
            return;
        }
        const metadata = typedContext && tool.audit.metadata ? tool.audit.metadata(typedContext) : undefined;
        const target = typedContext && output && tool.audit.targetFromOutput ? tool.audit.targetFromOutput({ ...typedContext, output }) : undefined;
        recordManagementMcpAudit({
            account: context.account,
            environment: context.environment,
            plan: context.plan,
            auditContext: context.audit,
            policy,
            outcome,
            target,
            metadata
        });
    } catch {
        // Audit resolution must never change a tool's result or leak the submitted arguments into logs.
        logger.error('Failed to resolve Management MCP audit data', { toolName: tool.name });
    }
}
