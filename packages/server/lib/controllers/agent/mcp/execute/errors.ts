import { getLogger } from '@nangohq/utils';

import { InternalMcpError, PublicMcpError } from '../../../mcp/utils.js';

import type { ActionExecutionError } from '../../../../services/action.service.js';

const logger = getLogger('Server.MCP.AgentSession.Execute');

/**
 * The session resolved the connection and checked the tool against the compiled toolset before
 * executing, so a lookup failure here means the session's view and the environment have diverged,
 * for instance because the function was undeployed mid-session. The agent is told that much, since
 * it is the one that has to pick something else.
 */
export function actionExecutionErrorToMcp({ error, integrationId, toolName }: { error: ActionExecutionError; integrationId: string; toolName: string }): Error {
    const code = error.code;
    switch (code) {
        case 'unknown_connection':
            return new PublicMcpError(`The connection this session resolved for integration '${integrationId}' no longer exists.`);
        case 'unknown_provider':
            return new PublicMcpError(`Integration '${integrationId}' no longer exists.`);
        case 'unknown_action':
            return new PublicMcpError(`Tool '${toolName}' is no longer deployed on integration '${integrationId}'.`);
        case 'disabled_action':
            return new PublicMcpError(`Tool '${toolName}' is disabled on integration '${integrationId}'.`);
        case 'action_failed':
            return new PublicMcpError(error.nangoError?.message ?? error.message);
        case 'internal_error':
            return new InternalMcpError();
        default: {
            const exhaustiveCheck: never = code;
            logger.error('Unexpected ActionExecutionError code while running an agent session tool', { code: exhaustiveCheck });
            return new InternalMcpError();
        }
    }
}
