// `event` is the canonical audit blob we restore/export from — every field lives inside it. Only the
// ORDER BY / partition keys are materialized out for now; searchable columns come later.
// ReplacingMergeTree dedups on (account_id, occurred_at, id) — id is stamped at publish so redeliveries
// collapse to one row; counts need FINAL / GROUP BY id.
export const sql = [
    `
    CREATE TABLE IF NOT EXISTS {database:Identifier}.audit_trail_events
    (
        event          String CODEC(ZSTD(3)),
        retention_days UInt16,                          -- fixed app-level tier (e.g. 90/180/365), never free-form — bounds partitions
        id             UUID          MATERIALIZED toUUID(JSONExtractString(event, 'id')),
        account_id     Int64         MATERIALIZED JSONExtractInt(event, 'accountId'),
        occurred_at    DateTime64(3) MATERIALIZED parseDateTime64BestEffort(JSONExtractString(event, 'occurredAt'), 3)
    )
    ENGINE = ReplacingMergeTree
    PARTITION BY (retention_days, toYYYYMM(occurred_at))
    ORDER BY (account_id, occurred_at, id)
    TTL toDateTime(occurred_at) + INTERVAL retention_days DAY
    SETTINGS ttl_only_drop_parts = 1
    `
];
