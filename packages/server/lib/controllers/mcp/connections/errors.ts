import { InternalMcpError, PublicMcpError } from '../utils.js';

import type { ConnectionRetrievalServiceError } from '../../../services/connectionRetrieval.service.js';

export function getConnectionServiceErrorToMcp(error: ConnectionRetrievalServiceError): Error {
    switch (error.code) {
        case 'unknown_provider_config':
        case 'not_found':
        case 'invalid_credentials':
            return new PublicMcpError(error.message);
        case 'get_failed':
            return new InternalMcpError();
        default: {
            const exhaustiveCheck: never = error.code;
            return exhaustiveCheck;
        }
    }
}
