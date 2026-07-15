// `event` is the canonical audit blob we restore/export from — every field lives inside it. Only the
// ORDER BY / partition keys are materialized out for now; searchable columns come later. `version` is
// not implemented yet — the event is currently unversioned.
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
