// Non-throwing extracts, unlike the ORDER BY keys: a blob these can't read is still a storable event.
// `resource_action` is its own column because two `set` indexes AND-ed prune per column, not per pair.
export const sql = [
    `
    ALTER TABLE {database:Identifier}.audit_trail_events
        ADD COLUMN IF NOT EXISTS resource        LowCardinality(String) MATERIALIZED JSONExtractString(event, 'resource'),
        ADD COLUMN IF NOT EXISTS resource_action LowCardinality(String) MATERIALIZED concat(JSONExtractString(event, 'resource'), '.', JSONExtractString(event, 'action'))
    `,
    `
    ALTER TABLE {database:Identifier}.audit_trail_events
        ADD INDEX IF NOT EXISTS idx_resource        resource        TYPE set(0) GRANULARITY 1,
        ADD INDEX IF NOT EXISTS idx_resource_action resource_action TYPE set(0) GRANULARITY 1
    `
];
