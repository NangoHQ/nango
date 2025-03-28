import type { Timestamps } from '../db';

export interface DBPlan extends Timestamps {
    id: number;
    account_id: number;
    name: string;
    trial_start_at: Date | null;
    trial_end_at: Date | null;
    trial_extension_count: number;
    /**
     * Set to null to remove limit
     */
    max_connection_with_scripts: number | null;
    /**
     * Set to null to remove limit
     */
    max_environments: number | null;
    min_sync_frequency: number;
    has_sync_variant: boolean;
}
