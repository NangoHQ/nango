import type { ApiError, Endpoint } from '../api.js';
import type { ConnectUISettings } from './dto.js';

export type GetConnectUISettings = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/connect-ui-settings';
    Querystring: { env: string };
    Success: {
        data: ConnectUISettings;
    };
    Error: ApiError<'failed_to_get_connect_ui_settings'>;
}>;

export type PutConnectUISettings = Endpoint<{
    Method: 'PUT';
    Path: '/api/v1/connect-ui-settings';
    Querystring: { env: string };
    Body: ConnectUISettings;
    Success: {
        data: ConnectUISettings;
    };
    Error: ApiError<'failed_to_update_connect_ui_settings'>;
}>;
