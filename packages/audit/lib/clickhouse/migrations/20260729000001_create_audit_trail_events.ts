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
        occurred_at    DateTime64(3) MATERIALIZED parseDateTime64BestEffort(JSONExtractString(event, 'occurredAt'), 3),
        -- Unlike the other keys, JSONExtractInt can't throw: it yields 0 for a missing or malformed
        -- accountId, filing the event under the wrong account. Hence the two guards below.
        --
        -- JSONType reports the type ClickHouse parsed out of the JSON, not the domain: a plain integer
        -- comes back as Int64 whatever its sign, and UInt64 only appears above the Int64 range. So the
        -- type to accept is Int64, and "no negative account id" has to be a check on the value.
        -- account_id must stay signed for that to work — read into a UInt64 column, a negative wraps to
        -- a huge positive and passes account_id > 0. Both facts are pinned by a test.
        CONSTRAINT account_id_valid CHECK JSONType(event, 'accountId') = 'Int64' AND account_id > 0
    )
    ENGINE = ReplacingMergeTree
    PARTITION BY (retention_days, toYYYYMM(occurred_at))
    ORDER BY (account_id, occurred_at, id)
    TTL toDateTime(occurred_at) + INTERVAL retention_days DAY
    SETTINGS ttl_only_drop_parts = 1
    `
];
