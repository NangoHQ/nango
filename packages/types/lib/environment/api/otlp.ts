import type { ApiError, Endpoint } from '../../api.js';

export interface OtlpSettings {
    endpoint: string;
    headers: Record<string, string>;
}

export type UpdateOtlpSettings = Endpoint<{
    Method: 'POST';
    Querystring: {
        env: string;
    };
    Path: '/api/v1/environment/otlp/settings';
    Body: OtlpSettings;
    Success: OtlpSettings;
    Error: ApiError<'forbidden'>;
}>;
