// Non-throwing extracts, unlike the ORDER BY keys: a blob these can't read is still a storable event,
// so it must not be rejected at insert.
//
// `resource_action` is a separate column because two `set` indexes AND-ed prune per column, not per
// pair — a granule holding `connection.created` and `api_key.deleted` passes both `resource='connection'`
// and `action='deleted'` while containing no `connection.deleted`. There is no standalone `action`
// column: filtering by action alone isn't offered, so it would index nothing anyone queries.
//
// ALTER only fills new parts; older ones evaluate the expression on read (correct, just unpruned) and
// pick up the column when they next merge. No MATERIALIZE step: the table is empty at this migration,
// and on a large one it would be a blocking mutation at metering boot.
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
