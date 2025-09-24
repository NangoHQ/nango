import type { ConnectUIThemeSettings, Theme } from './dto.js';

export interface DBConnectUISettings {
    id: number;
    environment_id: number;
    theme: ConnectUIThemeSettings;
    default_theme: Theme;
    show_watermark: boolean;
    created_at: Date;
    updated_at: Date;
}
