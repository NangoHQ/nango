import type { ApiError, Endpoint } from '../api';

export type PostPublicWebhook = Endpoint<{
    Method: 'POST';
    Path: '/webhook/:environmentUuid/:providerConfigKey';
    Params: {
        environmentUuid: string;
        providerConfigKey: string;
    };
    Error: ApiError<'unknown_environment'> | ApiError<'unknown_provider_config'>;
    Success: any;
}>;
