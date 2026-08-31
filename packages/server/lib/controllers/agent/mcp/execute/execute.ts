import tracer from 'dd-trace';

import { Err, Ok } from '@nangohq/utils';

import { executeAction } from '../../../../services/action.service.js';
import { PublicMcpError } from '../../../mcp/utils.js';
import { defineAgentSessionMcpTool } from '../sessionTool.js';
import { actionExecutionErrorToMcp } from './errors.js';
import { executeInputSchema } from './schema.js';

import type { AgentSessionMcpContext } from '../sessionTool.js';
import type { AgentSession } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Span } from 'dd-trace';

// Same default as the public trigger endpoint.
const RETRY_MAX = 0;

export const executeTool = defineAgentSessionMcpTool({
    name: 'nango_execute',
    description:
        "Run one of this session's tools, named as it is listed in tools/list or returned by nango_tool_search, on the connection the session resolved for it. Reaches tools that are not listed, and tools whose input is not an object.",
    inputSchema: executeInputSchema,
    annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
    },
    isEnabled: (metaTools) => metaTools.nangoExecute,
    async handler({ args, ...context }) {
        const { session, callable } = context;

        const tool = callable.get(args.tool);
        if (!tool) {
            return Err(new PublicMcpError(unknownToolMessage(args.tool, session)));
        }

        return await executeSessionTool({ integrationId: tool.integrationId, toolName: tool.name, input: args.input, context });
    }
});

/**
 * A slug carries no integration the agent can fall back to, so the message has to point somewhere
 * it can actually recover, and only at a tool the session still has.
 */
function unknownToolMessage(name: string, session: AgentSession): string {
    const recovery = session.metaTools.nangoToolSearch
        ? 'Use nango_tool_search to find one, or call a tool by the name it is listed under.'
        : 'Call a tool by the name it is listed under.';

    return `Tool '${name}' is not one of this session's tools. ${recovery}`;
}

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
        // The same keys executeAction sets, so one concept is not queried under two names. It tags
        // only after its lookups, and those can fail, so a failed execution is attributable either way.
        span.setTag('nango.agentSessionId', session.id)
            .setTag('nango.accountId', account.id)
            .setTag('nango.environmentId', environment.id)
            .setTag('nango.providerConfigKey', integrationId)
            .setTag('nango.actionName', toolName);

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
