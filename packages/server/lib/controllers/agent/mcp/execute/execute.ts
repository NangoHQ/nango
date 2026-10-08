import tracer from 'dd-trace';

import { Err, Ok } from '@nangohq/utils';

import { executeAction } from '../../../../services/action.service.js';
import { trackAgentSessionToolCall } from '../../../../services/agentSessionAnalytics.service.js';
import { callRemoteTool, withRemoteMcpSession } from '../../../../services/remoteMcp.service.js';
import { PublicMcpError } from '../../../mcp/utils.js';
import { notConnectedGuidance } from '../notConnectedGuidance.js';
import { resolveSessionConnection } from '../sessionConnection.js';
import { defineAgentSessionMcpTool, RemoteToolResult } from '../sessionTool.js';
import { actionExecutionErrorToMcp, remoteMcpErrorToMcp } from './errors.js';
import { executeInputSchema } from './schema.js';

import type { AgentSessionMetaTool } from '../../../../services/agentSessionAnalytics.service.js';
import type { AgentSessionMcpContext } from '../sessionTool.js';
import type { AgentSession, AgentSessionResolvedConnection } from '@nangohq/types';
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
    onInvalidArguments: ({ session }) => {
        trackAgentSessionToolCall({ metaTool: 'nango_execute', session, errorCode: 'invalid_input' });
    },
    async handler({ args, ...context }) {
        const { session, callable } = context;

        const tool = callable.get(args.tool);
        if (!tool) {
            trackAgentSessionToolCall({ metaTool: 'nango_execute', session, toolName: args.tool, errorCode: 'tool_not_in_session' });
            return Err(new PublicMcpError(unknownToolMessage(args.tool, session), { code: 'tool_not_in_session' }));
        }

        return await executeSessionTool({
            metaTool: 'nango_execute',
            integrationId: tool.integrationId,
            toolName: tool.name,
            pinned: tool.pinned,
            input: args.input,
            context
        });
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
    metaTool,
    integrationId,
    toolName,
    pinned,
    input,
    context
}: {
    metaTool?: AgentSessionMetaTool | undefined;
    integrationId: string;
    toolName: string;
    pinned: boolean;
    input?: unknown;
    context: AgentSessionMcpContext;
}): Promise<Result<unknown>> {
    const { account, environment, session } = context;

    const track = (properties: ToolCallOutcome) => {
        trackAgentSessionToolCall({ metaTool, session, integrationId, toolName, pinned, ...properties });
    };

    const integration = Object.hasOwn(session.compiledToolset, integrationId) ? session.compiledToolset[integrationId] : undefined;
    if (!integration) {
        track({ errorCode: 'unknown_integration' });
        return Err(
            new PublicMcpError(`Integration '${integrationId}' is not one of this session's integrations. Use one this session has.`, {
                code: 'unknown_integration',
                integrationId
            })
        );
    }

    const compiledTool = [...integration.pinned, ...integration.searchable].find((tool) => tool.name === toolName);
    if (!compiledTool) {
        track({ errorCode: 'tool_not_in_session' });
        return Err(
            new PublicMcpError(
                `Tool '${toolName}' is not in this session's toolset for integration '${integrationId}'. Use one of the session's own tools instead.`,
                {
                    code: 'tool_not_in_session',
                    integrationId
                }
            )
        );
    }

    const connection = await resolveSessionConnection({ session, integrationId });
    if (!connection) {
        track({ errorCode: 'integration_not_connected' });
        return Err(
            new PublicMcpError(
                `Integration '${integrationId}' has no connection in this session, so none of its tools can run. ${notConnectedGuidance(integrationId, session)}`,
                { code: 'integration_not_connected', integrationId }
            )
        );
    }

    if (compiledTool.mcp) {
        return await executeRemoteTool({ integrationId, toolName, input, connection, context, track: (properties) => track({ ...properties, mcpTool: true }) });
    }

    return await tracer.trace<Promise<Result<unknown>>>('server.mcp.agentSession.execute', async (span: Span) => {
        // The same keys executeAction sets, so one concept is not queried under two names. It tags
        // only after its lookups, and those can fail, so a failed execution is attributable either way.
        span.setTag('nango.agentSessionId', session.id)
            .setTag('nango.accountId', account.id)
            .setTag('nango.environmentId', environment.id)
            .setTag('nango.providerConfigKey', integrationId)
            .setTag('nango.actionName', toolName);

        const { logCtx, result } = await executeAction({
            account,
            environment,
            connectionId: connection.connectionId,
            providerConfigKey: integrationId,
            actionName: toolName,
            input,
            isAsync: false,
            retryMax: RETRY_MAX,
            span,
            actor: { kind: 'session', id: session.id }
        });

        if (result.isErr()) {
            span.setTag('nango.error', result.error);
            track({ logOperationId: logCtx?.id, errorCode: result.error.code, underlyingErrorCode: result.error.nangoError?.type });
            return Err(actionExecutionErrorToMcp({ error: result.error, integrationId, toolName }));
        }

        track({ logOperationId: logCtx?.id });
        return Ok('data' in result.value ? result.value.data : null);
    });
}

interface ToolCallOutcome {
    logOperationId?: string | undefined;
    errorCode?: string | undefined;
    underlyingErrorCode?: string | undefined;
    mcpTool?: boolean | undefined;
}

/** Sent to the integration's MCP server through the proxy, so the agent never holds its credentials. */
async function executeRemoteTool({
    integrationId,
    toolName,
    input,
    connection,
    context,
    track
}: {
    integrationId: string;
    toolName: string;
    input: unknown;
    connection: AgentSessionResolvedConnection;
    context: AgentSessionMcpContext;
    track: (properties: ToolCallOutcome) => void;
}): Promise<Result<unknown>> {
    const { account, environment, plan, session } = context;

    if (input !== undefined && (typeof input !== 'object' || input === null || Array.isArray(input))) {
        track({ errorCode: 'invalid_input' });
        return Err(
            new PublicMcpError(`Tool '${toolName}' takes an object as its input. Correct the input and call it again.`, {
                code: 'invalid_input',
                integrationId
            })
        );
    }

    return await tracer.trace<Promise<Result<unknown>>>('server.mcp.agentSession.execute', async (span: Span) => {
        span.setTag('nango.agentSessionId', session.id)
            .setTag('nango.accountId', account.id)
            .setTag('nango.environmentId', environment.id)
            .setTag('nango.providerConfigKey', integrationId)
            .setTag('nango.connectionId', connection.connectionId)
            .setTag('nango.mcpToolName', toolName);

        const { logOperationId, result } = await withRemoteMcpSession(
            {
                account,
                environment,
                plan,
                integrationId,
                connectionId: connection.connectionId,
                provider: connection.provider,
                actor: { kind: 'session', id: session.id }
            },
            async (mcp) => await callRemoteTool(mcp, { name: toolName, args: (input as Record<string, unknown> | undefined) ?? {} })
        );

        if (result.isErr()) {
            span.setTag('nango.error', result.error);
            const error = remoteMcpErrorToMcp({ error: result.error, integrationId, toolName });
            track({ logOperationId, errorCode: error instanceof PublicMcpError ? error.code : 'internal_error', underlyingErrorCode: result.error.code });
            return Err(error);
        }

        track({ logOperationId, ...(result.value.isError ? { errorCode: 'tool_failed' } : {}) });
        return Ok(new RemoteToolResult(result.value));
    });
}
