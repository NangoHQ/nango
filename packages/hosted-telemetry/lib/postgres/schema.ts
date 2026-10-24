export const HOSTED_TELEMETRY_SCHEMA = 'hosted_telemetry';
export const HOSTED_TELEMETRY_TABLE = 'metrics';

// Attributes sit in the primary key, and a btree entry cannot exceed ~2.7 KB.
export const HOSTED_TELEMETRY_ATTRIBUTES_MAX_BYTES = 1024;

// knex's own tracking table, kept inside the hosted telemetry schema so it cannot interfere with other migration sets.
export const HOSTED_TELEMETRY_MIGRATIONS_TABLE = 'migrations';
