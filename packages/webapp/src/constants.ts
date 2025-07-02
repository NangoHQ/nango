import type { CreateConnectUISettingsInput } from '@nangohq/types';

export const PROD_ENVIRONMENT_NAME = 'prod';

export const DEFAULT_CONNECT_UI_SETTINGS: CreateConnectUISettingsInput = {
    nangoWatermark: true,
    colors: {
        primary: '#000000',
        onPrimary: '#FFFFFF',
        background: '#FFFFFF',
        surface: '#f4f4f5',
        text: '#000000',
        textMuted: '#a9acb3'
    }
};
