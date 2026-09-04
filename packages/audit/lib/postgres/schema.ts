export const AUDIT_SCHEMA = 'audit';
export const AUDIT_EVENTS_TABLE = 'audit_trail_events';

// knex's own tracking table, kept inside the audit schema so the two migration sets cannot interfere.
export const AUDIT_MIGRATIONS_TABLE = 'migrations';
