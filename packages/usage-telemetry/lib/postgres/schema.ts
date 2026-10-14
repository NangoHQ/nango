export const USAGE_TELEMETRY_SCHEMA = 'usage_telemetry';
export const USAGE_TELEMETRY_TABLE = 'metrics';

// knex's own tracking table, kept inside the usage telemetry schema so it cannot interfere with other migration sets.
export const USAGE_TELEMETRY_MIGRATIONS_TABLE = 'migrations';
