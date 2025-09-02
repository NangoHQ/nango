import type { ConnectUIThemeSettings } from './dto.js';

export interface DBConnectUISettings {
    id: number;
    environment_id: number;
    theme: ConnectUIThemeSettings;
    show_watermark: boolean;
    created_at: Date;
    updated_at: Date;
}
