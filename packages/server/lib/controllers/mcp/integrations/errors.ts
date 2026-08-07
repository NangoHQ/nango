import { PublicMcpError } from '../utils.js';

import type { CreateIntegrationServiceError, GetIntegrationServiceError, UpdateIntegrationsServiceError } from '../../../services/integration.service.js';

export function createIntegrationServiceErrorToMcp(error: CreateIntegrationServiceError): Error {
    const code = error.code;
    switch (code) {
        case 'invalid_provider':
            return new PublicMcpError('Invalid provider');
        case 'incompatible_credentials':
            return incompatibleCredentialsError();
        case 'missing_credentials':
            return new PublicMcpError('Credentials are required for this provider');
        case 'nango_credentials_unsupported':
            return new PublicMcpError('Nango-provided credentials are only available for OAuth providers that require a developer app');
        case 'integration_exists':
            return integrationExistsError();
        case 'shared_credentials_not_found':
            return new PublicMcpError('Nango-provided credentials are not configured for this provider');
        case 'invalid_integration_config':
            return new PublicMcpError(error.message);
        case 'shared_credentials_load_failed':
        case 'create_failed':
            return error;
        default: {
            const exhaustiveCheck: never = code;
            void exhaustiveCheck;
            return error;
        }
    }
}

export function getIntegrationServiceErrorToMcp(error: GetIntegrationServiceError): Error {
    const code = error.code;
    switch (code) {
        case 'not_found':
            return new PublicMcpError(error.message);
        case 'get_failed':
            return error;
        default: {
            const exhaustiveCheck: never = code;
            void exhaustiveCheck;
            return error;
        }
    }
}

export function updateIntegrationsServiceErrorToMcp(error: UpdateIntegrationsServiceError): Error {
    const code = error.code;
    switch (code) {
        case 'not_found':
        case 'invalid_integration_config':
        case 'integration_has_connections':
        case 'custom_not_allowed':
            return new PublicMcpError(error.message);
        case 'incompatible_credentials':
            return incompatibleCredentialsError();
        case 'integration_exists':
            return integrationExistsError();
        case 'update_failed':
            return error;
        default: {
            const exhaustiveCheck: never = code;
            void exhaustiveCheck;
            return error;
        }
    }
}

function incompatibleCredentialsError(): PublicMcpError {
    return new PublicMcpError('Credentials are incompatible with the provider auth mode');
}

function integrationExistsError(): PublicMcpError {
    return new PublicMcpError('Integration ID already exists');
}
