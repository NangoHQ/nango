import { getLogger } from '@nangohq/utils';

import { InternalMcpError, PublicMcpError, safeFailureDetail } from '../../../mcp/utils.js';
import { proxyErrorToMcp } from '../proxy/errors.js';

import type { ActionExecutionError } from '../../../../services/action.service.js';
import type { RemoteMcpError } from '../../../../services/remoteMcp.service.js';

const logger = getLogger('Server.MCP.AgentSession.Execute');

export function actionExecutionErrorToMcp({ error, integrationId, toolName }: { error: ActionExecutionError; integrationId: string; toolName: string }): Error {
    const code = error.code;
    switch (code) {
        case 'unknown_connection':
            return new PublicMcpError(
                `Integration '${integrationId}' is no longer connected, so nothing on it can run. Tell the user they need to reconnect it.`,
                { code: 'integration_not_connected', integrationId }
            );
        case 'unknown_provider':
            return new PublicMcpError(
                `Integration '${integrationId}' is not available any more. Use another integration if one fits, and otherwise tell the user the request cannot be completed.`,
                { code: 'unknown_integration', integrationId }
            );
        case 'unknown_action':
        case 'disabled_action':
            return new PublicMcpError(
                `Tool '${toolName}' is not available on integration '${integrationId}'. Use another tool for the task, or tell the user it cannot be done.`,
                { code: 'tool_not_in_session', integrationId }
            );
        case 'action_failed':
            return new PublicMcpError(
                `Tool '${toolName}' ran on integration '${integrationId}' and failed: ${error.nangoError ? safeFailureDetail(error.nangoError) : error.message}. Read the failure before deciding whether to call it again with different input or to tell the user.`,
                { code: 'tool_failed', integrationId }
            );
        case 'internal_error':
            return new InternalMcpError();
        default: {
            const exhaustiveCheck: never = code;
            logger.error('Unexpected ActionExecutionError code while running an agent session tool', { code: exhaustiveCheck });
            return new InternalMcpError();
        }
    }
}

export function remoteMcpErrorToMcp({ error, integrationId, toolName }: { error: RemoteMcpError; integrationId: string; toolName: string }): Error {
    const code = error.code;
    switch (code) {
        case 'proxy_failed':
            return error.proxyError ? proxyErrorToMcp({ error: error.proxyError, integrationId }) : new InternalMcpError();
        case 'http_error':
            if (error.status === 401 || error.status === 403) {
                return new PublicMcpError(
                    `The MCP server for '${integrationId}' refused the connection's credentials, so none of its tools can run. Tell the user they need to reconnect it.`,
                    { code: 'integration_not_connected', integrationId }
                );
            }
            return new PublicMcpError(
                `The MCP server for '${integrationId}' answered with HTTP ${error.status}. Try once more, and tell the user if it keeps failing.`,
                { code: 'provider_error', integrationId }
            );
        case 'invalid_response':
            return new PublicMcpError(
                `The MCP server for '${integrationId}' sent a response that is not valid MCP. ${error.message}. Tell the user if it keeps failing.`,
                {
                    code: 'provider_error',
                    integrationId
                }
            );
        case 'rpc_error':
            if (error.method !== 'tools/call') {
                return new PublicMcpError(
                    `The MCP server for '${integrationId}' could not start a session: ${error.message}. Tell the user if it keeps failing.`,
                    { code: 'provider_error', integrationId }
                );
            }
            return new PublicMcpError(
                `Tool '${toolName}' on integration '${integrationId}' failed: ${error.message}. Read the failure before deciding whether to call it again with different input or to tell the user.`,
                { code: 'tool_failed', integrationId }
            );
        default: {
            code satisfies never;
            return new InternalMcpError();
        }
    }
}
