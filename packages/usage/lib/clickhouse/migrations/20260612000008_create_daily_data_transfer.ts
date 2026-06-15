export const sql = [
    `
    CREATE TABLE IF NOT EXISTS {database:Identifier}.daily_data_transfer
    (
        day              Date,
        account_id       Int64,
        environment_id   Int64,
        integration_id   LowCardinality(String),
        connection_id    String,
        direction        LowCardinality(String),
        package          LowCardinality(String),
        callsite         String,
        value            UInt64
    )
    ENGINE = SummingMergeTree(value)
    PARTITION BY toYYYYMM(day)
    ORDER BY (account_id, day, environment_id, integration_id, connection_id, direction, package, callsite)
    TTL day + INTERVAL 24 MONTH
    `,
    `
    CREATE MATERIALIZED VIEW IF NOT EXISTS {database:Identifier}.daily_data_transfer_mv
    TO {database:Identifier}.daily_data_transfer AS
    SELECT
        toDate(ts)                              AS day,
        account_id,
        attributes.environmentId::Int64        AS environment_id,
        attributes.integrationId::String       AS integration_id,
        attributes.connectionId::String        AS connection_id,
        attributes.direction::String           AS direction,
        attributes.package::String             AS package,
        attributes.callsite::String            AS callsite,
        sum(value)                             AS value
    FROM {database:Identifier}.raw_events
    WHERE type = 'usage.data_transfer'
    GROUP BY day, account_id, environment_id, integration_id, connection_id,
             direction, package, callsite
    `
];
