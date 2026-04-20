export const sql = [
    `
    CREATE TABLE IF NOT EXISTS {database:Identifier}.raw_events
    (
        ts               DateTime64(3),
        idempotency_key  String,
        type             LowCardinality(String),
        account_id       Int64,
        value            Float64,
        attributes       JSON
    )
    ENGINE = ReplacingMergeTree()
    PARTITION BY toYYYYMM(ts)
    ORDER BY (account_id, type, idempotency_key)
    TTL toDateTime(ts) + INTERVAL 90 DAY
    `
];
