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
    connection_with_scripts_max: number | null;

    /**
     * Limit the number of environments that can be created
     * Set to null to remove limit
     * @default 2
     */
    environments_max: number | null;

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
    has_sync_variant: boolean;

    /**
     * Enable or disabled open telemetry export
     * @default false
     */
    has_otel: boolean;
}
