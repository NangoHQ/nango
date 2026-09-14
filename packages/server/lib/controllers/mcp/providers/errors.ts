import { getLogger } from '@nangohq/utils';

import { InternalMcpError, PublicMcpError } from '../utils.js';

import type { GetProviderServiceError } from '../../../services/provider.service.js';

const logger = getLogger('Server.MCP.Providers');

export function getProviderServiceErrorToMcp(error: GetProviderServiceError): Error {
    const code = error.code;
    switch (code) {
        case 'not_found':
            return new PublicMcpError(error.message);
        case 'get_failed':
        case 'list_templates_failed':
            logger.error('Failed to get provider', { err: error });
            return new InternalMcpError();
        default: {
            const exhaustiveCheck: never = code;
            logger.error('Unexpected ProviderService error code while getting provider', { code: exhaustiveCheck });
            return new InternalMcpError();
        }
    }
}
