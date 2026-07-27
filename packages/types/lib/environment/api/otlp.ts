import type { ApiEndpoint, ApiError } from '../../api.js';

export interface OtlpSettings {
    endpoint: string;
    headers: Record<string, string>;
}

export type UpdateOtlpSettings = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'TODO: audit coverage pending' };
    Method: 'POST';
    Querystring: {
        env: string;
    };
    Path: '/api/v1/environment/otlp/settings';
    Body: OtlpSettings;
    Success: OtlpSettings;
    Error: ApiError<'forbidden'>;
}>;
