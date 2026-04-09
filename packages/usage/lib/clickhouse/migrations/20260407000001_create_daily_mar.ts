export const sql = [
    `
    CREATE TABLE IF NOT EXISTS usage.daily_mar
    (
        day              Date,
        account_id       Int64,
        environment_id   Int64,
        integration_id   LowCardinality(String),
        connection_id    String,
        sync_id          String,
        model            LowCardinality(String),
        value            Int64
    )
    ENGINE = SummingMergeTree(value)
    PARTITION BY toYYYYMM(day)
    ORDER BY (account_id, day, environment_id, integration_id, connection_id, sync_id, model)
    TTL day + INTERVAL 24 MONTH
    `,
    `
    CREATE MATERIALIZED VIEW IF NOT EXISTS usage.daily_mar_mv
    TO usage.daily_mar AS
    SELECT
        toDate(ts)                          AS day,
        account_id,
        attributes.environmentId::Int64     AS environment_id,
        attributes.integrationId::String    AS integration_id,
        attributes.connectionId::String     AS connection_id,
        attributes.syncId::String           AS sync_id,
        attributes.model::String            AS model,
        sum(value)                          AS value
    FROM usage.raw_events
    WHERE type = 'usage.monthly_active_records'
    GROUP BY day, account_id, environment_id, integration_id, connection_id, sync_id, model
    `
];
