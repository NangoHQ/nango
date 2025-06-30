import type { TimestampsAndDeletedCorrect } from '../db.js';

export interface DBConnectUISettings extends TimestampsAndDeletedCorrect {
    id: number;
    environment_id: number;
    primary_color?: string | undefined;
}
