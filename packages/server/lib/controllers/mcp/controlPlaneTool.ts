import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { ApiKeyScope, DBEnvironment, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export interface ControlPlaneMcpContext {
    account: DBTeam;
    environment: DBEnvironment;
    grantedScopes: string[] | undefined;
}

export interface ControlPlaneMcpTool<TResponse extends object = object> {
    name: string;
    description: string;
    inputSchema: AnySchema;
    outputSchema?: AnySchema;
    requiredScopes: ApiKeyScope[];
    handler: (args: unknown, context: ControlPlaneMcpContext) => Promise<Result<TResponse>>;
}
