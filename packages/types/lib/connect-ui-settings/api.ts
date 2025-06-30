import type { Endpoint } from '../api.js';
import type { CreateConnectUISettingsInput } from './dto.js';

export type PostConnectUISettings = Endpoint<{
    Method: 'POST';
    Path: '/connect-ui-settings';
    Body: CreateConnectUISettingsInput;
    Success: {
        success: boolean;
    };
}>;
