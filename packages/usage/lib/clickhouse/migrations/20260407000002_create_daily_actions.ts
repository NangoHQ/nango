export const sql = [
    `
    CREATE TABLE IF NOT EXISTS {database:Identifier}.daily_actions
    (
        day              Date,
        account_id       Int64,
        environment_id   Int64,
        integration_id   LowCardinality(String),
        connection_id    String,
        action_name      String,
        value            Int64
    )
    ENGINE = SummingMergeTree(value)
    PARTITION BY toYYYYMM(day)
    ORDER BY (account_id, day, environment_id, integration_id, connection_id, action_name)
    TTL day + INTERVAL 24 MONTH
    `,
    `
    CREATE MATERIALIZED VIEW IF NOT EXISTS {database:Identifier}.daily_actions_mv
    TO {database:Identifier}.daily_actions AS
    SELECT
        toDate(ts)                          AS day,
        account_id,
        attributes.environmentId::Int64     AS environment_id,
        attributes.integrationId::String    AS integration_id,
        attributes.connectionId::String     AS connection_id,
        attributes.actionName::String       AS action_name,
        sum(value)                          AS value
    FROM {database:Identifier}.raw_events
    WHERE type = 'usage.actions'
    GROUP BY day, account_id, environment_id, integration_id, connection_id, action_name
    `
];
