import type { ApiEndpoint, ApiError } from '../api.js';

export type PostPublicWebhook = ApiEndpoint<{
    Audit: { reason: 'non-auditable' };
    Method: 'POST';
    Path: '/webhook/:environmentUuid/:providerConfigKey';
    Params: {
        environmentUuid: string;
        providerConfigKey: string;
    };
    Error: ApiError<'unknown_environment'> | ApiError<'unknown_provider_config'>;
    Success: any;
}>;
