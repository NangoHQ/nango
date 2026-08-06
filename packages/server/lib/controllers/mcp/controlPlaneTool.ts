import { Err } from '@nangohq/utils';

import { PublicMcpError } from './utils.js';

import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ApiKeyScope, DBEnvironment, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type * as z from 'zod/v4';

export interface ControlPlaneMcpContext {
    account: DBTeam;
    environment: DBEnvironment;
    grantedScopes: string[] | undefined;
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
    handler: (args: unknown, context: ControlPlaneMcpContext) => Promise<Result<TResponse>>;
}

type ControlPlaneMcpToolDefinition<TInputSchema extends z.ZodType, TResponse extends object> = Omit<
    ControlPlaneMcpTool<TResponse>,
    'handler' | 'inputSchema'
> & {
    inputSchema: TInputSchema;
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
                return Err(new PublicMcpError(formatArgumentsError(tool.name, parsedArgs.error)));
            }

            return await tool.handler({ ...context, args: parsedArgs.data });
        }
    };
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
