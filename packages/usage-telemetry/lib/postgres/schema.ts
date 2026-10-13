import type { UsageAttributes } from '../types.js';

export const USAGE_TELEMETRY_SCHEMA = 'nango_usage_telemetry';
export const USAGE_TELEMETRY_TABLE = 'points';

// knex's own tracking table, kept inside the usage telemetry schema so it cannot interfere with other migration sets.
export const USAGE_TELEMETRY_MIGRATIONS_TABLE = 'migrations';

export interface DBPoint {
    ts: Date;
    value: number;
    metric: string;
    attributes: UsageAttributes;
}
