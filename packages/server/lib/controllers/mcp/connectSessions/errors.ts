import { PublicMcpError } from '../utils.js';

import type { CreateConnectSessionError } from '../../../services/connectSession.service.js';

export function createConnectSessionServiceErrorToMcp(error: CreateConnectSessionError): Error {
    switch (error.code) {
        case 'resource_capped':
        case 'docs_connect_override_forbidden':
            return new PublicMcpError(error.message);
        case 'integration_not_found': {
            const integrationIds = [...new Set((error.missingIntegrations || []).map(({ integrationId }) => integrationId))];
            return new PublicMcpError(`Integrations do not exist: ${integrationIds.join(', ')}`);
        }
        case 'session_creation_failed':
        case 'token_creation_failed':
            return error;
        default:
            return unexpectedConnectSessionServiceError(error.code, error);
    }
}

function unexpectedConnectSessionServiceError(_code: never, error: Error): Error {
    return error;
}
