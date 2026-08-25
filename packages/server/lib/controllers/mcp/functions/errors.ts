import { getLogger } from '@nangohq/utils';

import { InternalMcpError, PublicMcpError } from '../utils.js';

import type { ListFunctionsError } from '@nangohq/shared';

const logger = getLogger('Server.MCP.Functions');

export function listFunctionsServiceErrorToMcp(error: ListFunctionsError): Error {
    const code = error.code;
    switch (code) {
        case 'integration_not_found':
            return new PublicMcpError(error.message);
        case 'list_failed': {
            logger.error('Failed to list functions', { err: error });
            return new InternalMcpError();
        }
        default: {
            const exhaustiveCheck: never = code;
            logger.error('Unexpected ListFunctionsError code while listing functions', { code: exhaustiveCheck });
            return new InternalMcpError();
        }
    }
}
