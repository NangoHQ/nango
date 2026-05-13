// Replace the avg-aggregating MVs for records and connections with plain projections
// of raw_events. The new tables preserve slice dimensions as columns plus a `batch_id`
// (one UUID per metering cron firing) so the read side can reconstruct per-firing
// account totals and average across firings — matching the legacy HTTP path's
// `average(count)` semantic exactly, with no zero-fill or drift on multi-slice churn.
//
// Old MVs are dropped here; no live readers depend on them. New readers (getUsage,
// S3 export) will land in follow-up PRs against the new MVs.
export const sql = [
    // Drop old MVs first (they're the readers of raw_events), then their target tables.
    `DROP TABLE IF EXISTS {database:Identifier}.daily_records_mv`,
    `DROP TABLE IF EXISTS {database:Identifier}.daily_connections_mv`,
    `DROP TABLE IF EXISTS {database:Identifier}.daily_records`,
    `DROP TABLE IF EXISTS {database:Identifier}.daily_connections`,

    // Target table for the records projection.
    `
    CREATE TABLE IF NOT EXISTS {database:Identifier}.daily_raw_records
    (
        day              Date,
        account_id       Int64,
        environment_id   Int64,
        integration_id   LowCardinality(String),
        connection_id    String,
        model            LowCardinality(String),
        batch_id         UUID,
        value            Int64
    )
    ENGINE = MergeTree()
    PARTITION BY toYYYYMM(day)
    ORDER BY (account_id, day, batch_id)
    TTL day + INTERVAL 24 MONTH
    `,

    // MV: one row per raw event, slice dims extracted as columns. No aggregation.
    `
    CREATE MATERIALIZED VIEW IF NOT EXISTS {database:Identifier}.daily_raw_records_mv
    TO {database:Identifier}.daily_raw_records AS
    SELECT
        toDate(ts)                          AS day,
        account_id,
        attributes.environmentId::Int64     AS environment_id,
        attributes.integrationId::String    AS integration_id,
        attributes.connectionId::String     AS connection_id,
        attributes.model::String            AS model,
        attributes.batchId::UUID            AS batch_id,
        value::Int64                        AS value
    FROM {database:Identifier}.raw_events
    WHERE type = 'usage.records'
    `,

    // Same shape for connections (no connection_id / model — irrelevant for that metric).
    `
    CREATE TABLE IF NOT EXISTS {database:Identifier}.daily_raw_connections
    (
        day              Date,
        account_id       Int64,
        environment_id   Int64,
        integration_id   LowCardinality(String),
        batch_id         UUID,
        value            Int64
    )
    ENGINE = MergeTree()
    PARTITION BY toYYYYMM(day)
    ORDER BY (account_id, day, batch_id)
    TTL day + INTERVAL 24 MONTH
    `,

    `
    CREATE MATERIALIZED VIEW IF NOT EXISTS {database:Identifier}.daily_raw_connections_mv
    TO {database:Identifier}.daily_raw_connections AS
    SELECT
        toDate(ts)                          AS day,
        account_id,
        attributes.environmentId::Int64     AS environment_id,
        attributes.integrationId::String    AS integration_id,
        attributes.batchId::UUID            AS batch_id,
        value::Int64                        AS value
    FROM {database:Identifier}.raw_events
    WHERE type = 'usage.connections'
    `
];
