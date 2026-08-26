import tracer from 'dd-trace';

import { Err, Ok } from '@nangohq/utils';

import { executeAction } from '../../../../services/action.service.js';
import { PublicMcpError } from '../../../mcp/utils.js';
import { defineAgentSessionMcpTool } from '../sessionTool.js';
import { actionExecutionErrorToMcp } from './errors.js';
import { executeInputSchema } from './schema.js';

import type { AgentSessionMcpContext } from '../sessionTool.js';
import type { Result } from '@nangohq/utils';
import type { Span } from 'dd-trace';

// Same default as the public trigger endpoint.
const RETRY_MAX = 0;

export const executeTool = defineAgentSessionMcpTool({
    name: 'nango_execute',
    description: 'Run a tool on one of the session integrations, on the connection the session resolved for it.',
    inputSchema: executeInputSchema,
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
    },
    isEnabled: (metaTools) => metaTools.nangoExecute,
    async handler({ args, ...context }) {
        return await executeSessionTool({ integrationId: args.integration, toolName: args.tool, input: args.input, context });
    }
});

/** Synchronous, so a tool is capped at the orchestrator's synchronous limit (NAN-6090, ~120s). */
export async function executeSessionTool({
    integrationId,
    toolName,
    input,
    context
}: {
    integrationId: string;
    toolName: string;
    input?: unknown;
    context: AgentSessionMcpContext;
}): Promise<Result<unknown>> {
    const { account, environment, session } = context;

    const integration = Object.hasOwn(session.compiledToolset, integrationId) ? session.compiledToolset[integrationId] : undefined;
    if (!integration) {
        return Err(new PublicMcpError(`Integration '${integrationId}' is not one of this session's integrations.`));
    }

    const isInToolset = [...integration.pinned, ...integration.searchable].some((tool) => tool.name === toolName);
    if (!isInToolset) {
        return Err(new PublicMcpError(`Tool '${toolName}' is not in this session's toolset for integration '${integrationId}'.`));
    }

    const connection = Object.hasOwn(session.resolvedConnections, integrationId) ? session.resolvedConnections[integrationId] : undefined;
    if (!connection) {
        return Err(new PublicMcpError(`Integration '${integrationId}' has no connection in this session.`));
    }

    return await tracer.trace<Promise<Result<unknown>>>('server.mcp.agentSession.execute', async (span: Span) => {
        span.setTag('nango.agentSessionId', session.id)
            .setTag('nango.accountId', account.id)
            .setTag('nango.environmentId', environment.id)
            .setTag('nango.integrationId', integrationId)
            .setTag('nango.toolName', toolName);

        const { result } = await executeAction({
            account,
            environment,
            connectionId: connection.connectionId,
            providerConfigKey: integrationId,
            actionName: toolName,
            input,
            isAsync: false,
            retryMax: RETRY_MAX,
            span
        });

        if (result.isErr()) {
            span.setTag('nango.error', result.error);
            return Err(actionExecutionErrorToMcp({ error: result.error, integrationId, toolName }));
        }

        return Ok('data' in result.value ? result.value.data : null);
    });
}
