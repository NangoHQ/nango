import type { Timestamps } from '../db';

export interface DBPlan extends Timestamps {
    id: number;
    account_id: number;
    name: string;
    trial_start_at: Date | null;
    trial_end_at: Date | null;
    trial_extension_count: number;
    trial_end_notified_at: Date | null;

    /**
     * Limit the number of connections with active scripts
     * Set to null to remove limit
     * @default 3
     */
    max_connection_with_scripts: number | null;

    /**
     * Limit the number of environments that can be created
     * Set to null to remove limit
     * @default 2
     */
    max_environments: number | null;

    /**
     * Limit the minimum frequency of a sync
     * Not used yet
     * @default 86400
     */
    min_sync_frequency: number;

    /**
     * Enable or disabled sync variant
     * @default false
     */
    has_sync_variant: boolean;
}
