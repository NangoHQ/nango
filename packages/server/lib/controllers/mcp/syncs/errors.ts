import { getLogger } from '@nangohq/utils';

import { InternalMcpError, PublicMcpError } from '../utils.js';

import type { RunSyncCommandError } from '@nangohq/shared';

const logger = getLogger('Server.MCP.Syncs');

export function syncCommandErrorToMcp(error: RunSyncCommandError): Error {
    const code = error.code;
    switch (code) {
        case 'no_syncs_found':
            return new PublicMcpError(error.message);
        case 'unknown_connection':
            return new PublicMcpError('Connection does not exist');
        case 'unknown_provider_config':
            return new PublicMcpError('Integration does not exist');
        default: {
            const exhaustiveCheck: never = code;
            logger.error('Unexpected RunSyncCommandError code while running sync command', { code: exhaustiveCheck });
            return new InternalMcpError();
        }
    }
}
