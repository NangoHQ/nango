export const sql = [
    `
    CREATE TABLE IF NOT EXISTS {database:Identifier}.daily_records
    (
        day              Date,
        account_id       Int64,
        environment_id   Int64,
        integration_id   LowCardinality(String),
        connection_id    String,
        model            LowCardinality(String),
        value            AggregateFunction(avg, Int64)
    )
    ENGINE = AggregatingMergeTree()
    PARTITION BY toYYYYMM(day)
    ORDER BY (account_id, day, environment_id, integration_id, connection_id, model)
    TTL day + INTERVAL 24 MONTH
    `,
    `
    CREATE MATERIALIZED VIEW IF NOT EXISTS {database:Identifier}.daily_records_mv
    TO {database:Identifier}.daily_records AS
    SELECT
        toDate(ts)                          AS day,
        account_id,
        attributes.environmentId::Int64     AS environment_id,
        attributes.integrationId::String    AS integration_id,
        attributes.connectionId::String     AS connection_id,
        attributes.model::String            AS model,
        avgState(value::Int64)              AS value
    FROM {database:Identifier}.raw_events
    WHERE type = 'usage.records'
    GROUP BY day, account_id, environment_id, integration_id, connection_id, model
    `
];
