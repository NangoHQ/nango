import type { Endpoint } from '../api.js';
import type { CreateConnectUISettingsInput, GetConnectUISettingsResponse } from './dto.js';

export type GetConnectUISettings = Endpoint<{
    Method: 'GET';
    Path: '/connect-ui-settings';
    Success: {
        data: GetConnectUISettingsResponse | null;
    };
}>;

export type PostConnectUISettings = Endpoint<{
    Method: 'POST';
    Path: '/connect-ui-settings';
    Body: CreateConnectUISettingsInput;
    Success: {
        success: boolean;
    };
}>;
