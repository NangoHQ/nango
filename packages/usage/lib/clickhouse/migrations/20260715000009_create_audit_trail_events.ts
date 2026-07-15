// Audit-log store (NAN-4530). `event` is the canonical immutable record — id, version, digest and
// every field live inside it, and it's what we reconstruct/export from. For now we materialize only
// the ORDER BY / partition keys out of the blob; searchable columns (actor, target, resource_action,
// …) are added later as needed. See proposals/nan-4530-benchmark-and-cost.md.
export const sql = [
    `
    CREATE TABLE IF NOT EXISTS {database:Identifier}.audit_trail_events
    (
        event          String,
        retention_days UInt16,                                                                        -- per-plan retention, set at ingestion (partition + TTL key)
        id             UUID          MATERIALIZED toUUIDOrZero(JSONExtractString(event, 'id')),
        account_id     Int64         MATERIALIZED JSONExtractInt(event, 'accountId'),
        occurred_at    DateTime64(3) MATERIALIZED parseDateTime64BestEffortOrZero(JSONExtractString(event, 'occurredAt'), 3)
    )
    ENGINE = ReplacingMergeTree
    PARTITION BY (retention_days, toYYYYMM(occurred_at))
    ORDER BY (account_id, occurred_at, id)
    TTL toDateTime(occurred_at) + INTERVAL retention_days DAY
    `
];
