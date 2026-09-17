import { getLogger } from '@nangohq/utils';

import { InternalMcpError, PublicMcpError } from '../utils.js';

import type { ActionExecutionError } from '../../../services/action.service.js';

const logger = getLogger('Server.MCP.Actions');

export function actionExecutionErrorToMcp(error: ActionExecutionError): Error {
    const code = error.code;
    switch (code) {
        case 'unknown_connection':
        case 'unknown_provider':
        case 'unknown_action':
        case 'disabled_action':
        case 'action_failed':
            return new PublicMcpError(error.message);
        case 'internal_error':
            logger.error('Failed to trigger action', { err: error });
            return new InternalMcpError();
        default: {
            const exhaustiveCheck: never = code;
            logger.error('Unexpected ActionExecutionError code while triggering action', { code: exhaustiveCheck });
            return new InternalMcpError();
        }
    }
}
