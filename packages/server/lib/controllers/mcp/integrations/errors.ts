import { PublicMcpError } from '../utils.js';

import type { IntegrationServiceError } from '../../../services/integration.service.js';

export function integrationServiceErrorToMcp(error: IntegrationServiceError): Error {
    const code = error.code;
    switch (code) {
        case 'invalid_provider':
            return new PublicMcpError('Invalid provider');
        case 'incompatible_credentials':
            return new PublicMcpError('Credentials are incompatible with the provider auth mode');
        case 'missing_credentials':
            return new PublicMcpError('Credentials are required for this provider');
        case 'nango_credentials_unsupported':
            return new PublicMcpError('Nango-provided credentials are only available for OAuth providers that require a developer app');
        case 'integration_exists':
            return new PublicMcpError('Integration ID already exists');
        case 'shared_credentials_not_found':
            return new PublicMcpError('Nango-provided credentials are not configured for this provider');
        case 'not_found':
        case 'invalid_integration_config':
        case 'integration_has_connections':
        case 'custom_not_allowed':
            return new PublicMcpError(error.message);
        case 'shared_credentials_load_failed':
        case 'create_failed':
        case 'list_failed':
        case 'get_failed':
        case 'update_failed':
        case 'delete_failed':
            return error;
        default: {
            const exhaustiveCheck: never = code;
            void exhaustiveCheck;
            return error;
        }
    }
}
