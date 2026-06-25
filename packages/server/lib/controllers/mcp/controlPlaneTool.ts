import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ApiKeyScope, DBEnvironment, DBTeam } from '@nangohq/types';

export interface ControlPlaneMcpContext {
    account: DBTeam;
    environment: DBEnvironment;
    grantedScopes: string[] | undefined;
}

export interface ControlPlaneMcpTool {
    name: string;
    description: string;
    inputSchema: AnySchema;
    requiredScopes: ApiKeyScope[];
    handler: (args: unknown, context: ControlPlaneMcpContext) => Promise<CallToolResult>;
}
