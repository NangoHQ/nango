import type { TimestampsAndDeletedCorrect } from '../db.js';

export interface DBConnectUISettings extends TimestampsAndDeletedCorrect {
    id: number;
    environment_id: number;
    nango_watermark: boolean;
    color_primary?: string | undefined;
    color_on_primary?: string | undefined;
    color_background?: string | undefined;
    color_surface?: string | undefined;
    color_text?: string | undefined;
    color_text_muted?: string | undefined;
}
