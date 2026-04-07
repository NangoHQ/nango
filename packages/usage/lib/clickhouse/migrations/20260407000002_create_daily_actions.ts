export const sql = [
    `
    CREATE TABLE IF NOT EXISTS usage.daily_actions
    (
        day              Date,
        account_id       Int64,
        environment_id   Int64,
<<<<<<< HEAD
=======
        environment_name LowCardinality(String),
>>>>>>> d86fbb6a3 (chore(usage): add clickhouse materialized views for metrics)
        integration_id   LowCardinality(String),
        connection_id    String,
        action_name      String,
        value            Int64
    )
    ENGINE = SummingMergeTree(value)
    PARTITION BY toYYYYMM(day)
<<<<<<< HEAD
    ORDER BY (account_id, day, environment_id, integration_id, connection_id, action_name)
    TTL day + INTERVAL 24 MONTH
=======
    ORDER BY (account_id, environment_id, integration_id, connection_id, action_name, day)
>>>>>>> d86fbb6a3 (chore(usage): add clickhouse materialized views for metrics)
    `,
    `
    CREATE MATERIALIZED VIEW IF NOT EXISTS usage.daily_actions_mv
    TO usage.daily_actions AS
    SELECT
        toDate(ts)                          AS day,
        account_id,
        attributes.environmentId::Int64     AS environment_id,
<<<<<<< HEAD
=======
        attributes.environmentName::String  AS environment_name,
>>>>>>> d86fbb6a3 (chore(usage): add clickhouse materialized views for metrics)
        attributes.integrationId::String    AS integration_id,
        attributes.connectionId::String     AS connection_id,
        attributes.actionName::String       AS action_name,
        sum(value)                          AS value
    FROM usage.raw_events
    WHERE type = 'usage.actions'
<<<<<<< HEAD
    GROUP BY day, account_id, environment_id, integration_id, connection_id, action_name
=======
    GROUP BY day, account_id, environment_id, environment_name, integration_id, connection_id, action_name
>>>>>>> d86fbb6a3 (chore(usage): add clickhouse materialized views for metrics)
    `
];
