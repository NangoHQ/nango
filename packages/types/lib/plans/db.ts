import type { Timestamps } from '../db';

export interface DBPlan extends Timestamps {
    id: number;
    account_id: number;
    name: string;

    // Trial
    // Remove all values when you upgrade a customer
    trial_start_at: Date | null;
    trial_end_at: Date | null;
    trial_extension_count: number;
    trial_end_notified_at: Date | null;
    trial_expired: boolean | null;

    /**
     * Limit the number of connections with active scripts
     * Set to null to remove limit
     * @default 3
     */
    connection_with_scripts_max: number | null;

    /**
     * Limit the number of environments that can be created
     * @default 2
     */
    environments_max: number;

    /**
     * Limit the minimum frequency of a sync
     * Not used yet
     * @default 86400
     */
    sync_frequency_secs_min: number;

    /**
     * Enable or disabled sync variant
     * @default false
     */
    has_sync_variants: boolean;

    /**
     * Enable or disabled open telemetry export
     * @default false
     */
    has_otel: boolean;
}
