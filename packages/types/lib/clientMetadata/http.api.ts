import type { ApiEndpoint, ApiError } from '../api.js';

export type GetPublicClientMetadata = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/oauth/client-metadata/:environmentUuid/:providerConfigKey';
    Params: {
        environmentUuid: string;
        providerConfigKey: string;
    };
    Error: ApiError<'unknown_environment'> | ApiError<'unknown_provider_config'>;
    Success: {
        client_id: string;
        client_name: string;
        client_uri: string;
        logo_uri?: string;
        redirect_uris: string[];
        grant_types: string[];
        response_types: string[];
        token_endpoint_auth_method: 'none';
    };
}>;
