export const HOSTED_TELEMETRY_SCHEMA = 'hosted_telemetry';
export const HOSTED_TELEMETRY_TABLE = 'metrics';

// knex's own tracking table, kept inside the hosted telemetry schema so it cannot interfere with other migration sets.
export const HOSTED_TELEMETRY_MIGRATIONS_TABLE = 'migrations';
