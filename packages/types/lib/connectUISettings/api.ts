import type { ApiEndpoint, ApiError } from '../api.js';
import type { ConnectUISettings } from './dto.js';

export type GetConnectUISettings = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/connect-ui-settings';
    Querystring: { env: string };
    Success: {
        data: ConnectUISettings;
    };
    Error: ApiError<'failed_to_get_connect_ui_settings'>;
}>;

export type PutConnectUISettings = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'PUT';
    Path: '/api/v1/connect-ui-settings';
    Querystring: { env: string };
    Body: ConnectUISettings;
    Success: {
        data: ConnectUISettings;
    };
    Error: ApiError<'failed_to_update_connect_ui_settings'>;
}>;
