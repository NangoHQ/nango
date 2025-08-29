import type { TimestampsAndDeletedCorrect } from '../db.js';

export interface DBSync extends TimestampsAndDeletedCorrect {
    id: string;
    nango_connection_id: number;
    name: string;
    variant: string;
    last_sync_date: Date | null;
    frequency: string | null;
    last_fetched_at: Date | null;
    sync_config_id: number;
}
