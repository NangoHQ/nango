import { getLogger } from '@nangohq/utils';

import { InternalMcpError, PublicMcpError, safeFailureDetail } from '../../../mcp/utils.js';

import type { ActionExecutionError } from '../../../../services/action.service.js';

const logger = getLogger('Server.MCP.AgentSession.Execute');

export function actionExecutionErrorToMcp({ error, integrationId, toolName }: { error: ActionExecutionError; integrationId: string; toolName: string }): Error {
    const code = error.code;
    switch (code) {
        case 'unknown_connection':
            return new PublicMcpError(
                `Integration '${integrationId}' is no longer connected, so nothing on it can run. Tell the user it needs to be reconnected.`,
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
