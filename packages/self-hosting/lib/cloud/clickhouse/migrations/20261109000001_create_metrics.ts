// The rows carry identity and data only. Customer, stage and anything descriptive live in the registry,
// so a registry change applies to old rows too and never needs a migration here.
export const sql = [
    `
    CREATE TABLE IF NOT EXISTS {database:Identifier}.metrics
    (
        installation_id UUID,
        ts              DateTime64(3),
        metric          LowCardinality(String),
        attributes      String,
        value           Float64,
        received_at     DateTime64(3) DEFAULT now64(3)
    )
    ENGINE = ReplacingMergeTree(received_at)
    PARTITION BY toYYYYMM(ts)
    ORDER BY (installation_id, metric, ts, attributes)
    `
];
