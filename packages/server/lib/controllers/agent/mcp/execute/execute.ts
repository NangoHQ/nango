import tracer from 'dd-trace';

import { Err, getLogger, Ok } from '@nangohq/utils';

import { executeAction } from '../../../../services/action.service.js';
import { InternalMcpError, PublicMcpError } from '../../../mcp/utils.js';
import { defineAgentSessionMcpTool } from '../sessionTool.js';
import { actionExecutionErrorToMcp } from './errors.js';
import { executeInputSchema } from './schema.js';

import type { AgentSessionMcpContext } from '../sessionTool.js';
import type { Result } from '@nangohq/utils';
import type { Span } from 'dd-trace';

const logger = getLogger('Server.MCP.AgentSession.Execute');

/** Same default as the public trigger endpoint. An agent that wants another attempt can call again. */
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

/**
 * Runs one tool of the session's toolset. Shared with pinned tools, which are listed under their own
 * name and so are called directly rather than through nango_execute.
 *
 * Every tool the session compiled is callable, pinned or not, so that a tool reached through
 * nango_tool_search runs without having to be listed first.
 *
 * Execution is synchronous, which caps a tool at the orchestrator's synchronous limit
 * (NAN-6090, ~120s). A tool that needs longer has no way to report progress until v1 grows a
 * polling tool.
 */
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

    const integration = session.compiledToolset[integrationId];
    if (!integration) {
        return Err(new PublicMcpError(`Integration '${integrationId}' is not one of this session's integrations.`));
    }

    const isInToolset = [...integration.pinned, ...integration.searchable].some((tool) => tool.name === toolName);
    if (!isInToolset) {
        return Err(new PublicMcpError(`Tool '${toolName}' is not in this session's toolset for integration '${integrationId}'.`));
    }

    const connection = session.resolvedConnections[integrationId];
    if (!connection) {
        // A toolset covering every integration in the environment reaches integrations the tenant
        // never connected. Their tools are listed and searchable, and this is where they fail.
        return Err(new PublicMcpError(`Integration '${integrationId}' has no connection in this session.`));
    }

    return await tracer.trace<Promise<Result<unknown>>>('server.mcp.agentSession.execute', async (span: Span) => {
        span.setTag('nango.agentSessionId', session.id);

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
            return Err(actionExecutionErrorToMcp({ error: result.error, integrationId, toolName }));
        }

        if (!('data' in result.value)) {
            // Only an async execution answers with a status url, and this one is never async.
            logger.error('Agent session tool execution answered asynchronously', { sessionId: session.id, integrationId, toolName });
            return Err(new InternalMcpError());
        }

        return Ok(result.value.data);
    });
}
