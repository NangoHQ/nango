import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { ApiKeyScope, DBEnvironment, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type * as z from 'zod/v4';

export interface ControlPlaneMcpContext {
    account: DBTeam;
    environment: DBEnvironment;
    grantedScopes: string[] | undefined;
}

export type ControlPlaneMcpSchema = AnySchema | z.ZodType;

export interface ControlPlaneMcpTool<TResponse extends object = object> {
    name: string;
    description: string;
    inputSchema: ControlPlaneMcpSchema;
    outputSchema?: ControlPlaneMcpSchema;
    requiredScopes: ApiKeyScope[];
    handler: (args: unknown, context: ControlPlaneMcpContext) => Promise<Result<TResponse>>;
}

export function defineControlPlaneMcpTool<TResponse extends object>(tool: ControlPlaneMcpTool<TResponse>): ControlPlaneMcpTool<TResponse> {
    return tool;
}
