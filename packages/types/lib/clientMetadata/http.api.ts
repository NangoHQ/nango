import type { ApiError, Endpoint } from '../api.js';

export type GetPublicClientMetadata = Endpoint<{
    Method: 'GET';
    Path: '/oauth/client-metadata/:environmentUuid/:providerConfigKey';
    Params: {
        environmentUuid: string;
        providerConfigKey: string;
    };
    Error: ApiError<'invalid_uri_params'> | ApiError<'feature_disabled'> | ApiError<'unknown_environment'> | ApiError<'unknown_provider_config'>;
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
