export const sql = [
    `
    CREATE TABLE IF NOT EXISTS {database:Identifier}.daily_connections
    (
        day              Date,
        account_id       Int64,
        environment_id   Int64,
        integration_id   LowCardinality(String),
        value            AggregateFunction(avg, Int64)
    )
    ENGINE = AggregatingMergeTree()
    PARTITION BY toYYYYMM(day)
    ORDER BY (account_id, day, environment_id, integration_id)
    TTL day + INTERVAL 24 MONTH
    `,
    `
    CREATE MATERIALIZED VIEW IF NOT EXISTS {database:Identifier}.daily_connections_mv
    TO {database:Identifier}.daily_connections AS
    SELECT
        toDate(ts)                          AS day,
        account_id,
        attributes.environmentId::Int64     AS environment_id,
        attributes.integrationId::String    AS integration_id,
        avgState(value::Int64)              AS value
    FROM {database:Identifier}.raw_events
    WHERE type = 'usage.connections'
    GROUP BY day, account_id, environment_id, integration_id
    `
];
