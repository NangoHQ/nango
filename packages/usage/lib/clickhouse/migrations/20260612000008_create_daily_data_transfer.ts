export const sql = [
    `
    CREATE TABLE IF NOT EXISTS {database:Identifier}.daily_data_transfer
    (
        day              Date,
        account_id       Int64,
        environment_id   Int64,
        integration_id   LowCardinality(String),
        connection_id    String,
        package          LowCardinality(String),
        callsite         LowCardinality(String),
        value            UInt64,
        ingressed_bytes  UInt64,
        egressed_bytes   UInt64
    )
    ENGINE = SummingMergeTree((value, ingressed_bytes, egressed_bytes))
    PARTITION BY toYYYYMM(day)
    ORDER BY (account_id, day, environment_id, integration_id, connection_id, package, callsite)
    TTL day + INTERVAL 24 MONTH
    `,
    `
    CREATE MATERIALIZED VIEW IF NOT EXISTS {database:Identifier}.daily_data_transfer_mv
    TO {database:Identifier}.daily_data_transfer AS
    SELECT
        toDate(ts)                             AS day,
        account_id,
        attributes.environmentId::Int64        AS environment_id,
        attributes.integrationId::String       AS integration_id,
        attributes.connectionId::String        AS connection_id,
        attributes.package::String             AS package,
        attributes.callsite::String            AS callsite,
        sum(value)                             AS value,
        sum(attributes.ingressedBytes::UInt64) AS ingressed_bytes,
        sum(attributes.egressedBytes::UInt64)  AS egressed_bytes
    FROM {database:Identifier}.raw_events
    WHERE type = 'usage.data_transfer'
    GROUP BY day, account_id, environment_id, integration_id, connection_id, package, callsite
    `
];
