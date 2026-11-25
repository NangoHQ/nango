import type { ApiEndpoint, ApiError } from '../api.js';

export type PostPublicWebhook = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'POST';
    Path: '/webhook/:environmentUuid/:providerConfigKey{/:eventType}';
    Params: {
        environmentUuid: string;
        providerConfigKey: string;
        eventType?: string | undefined;
    };
    Error: ApiError<'unknown_environment'> | ApiError<'unknown_provider_config'> | ApiError<'unknown_webhook_path'>;
    Success: any;
}>;
