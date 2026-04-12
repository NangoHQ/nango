export const sql = [
    `
    CREATE TABLE IF NOT EXISTS usage.daily_function_executions
    (
        day              Date,
        account_id       Int64,
        environment_id   Int64,
        integration_id   LowCardinality(String),
        connection_id    String,
        function_name    String,
        function_type    LowCardinality(String),
        success          Bool,
        runtime          LowCardinality(String),
        value            Int64,
        duration_ms      UInt64,
        custom_logs      UInt64,
        proxy_calls      UInt64
    )
    ENGINE = SummingMergeTree((value, duration_ms, custom_logs, proxy_calls))
    PARTITION BY toYYYYMM(day)
    ORDER BY (account_id, day, environment_id, integration_id, connection_id, function_type, function_name, success, runtime)
    TTL day + INTERVAL 24 MONTH
    `,
    `
    CREATE MATERIALIZED VIEW IF NOT EXISTS usage.daily_function_executions_mv
    TO usage.daily_function_executions AS
    SELECT
        toDate(ts)                                                              AS day,
        account_id,
        attributes.environmentId::Int64                                         AS environment_id,
        attributes.integrationId::String                                        AS integration_id,
        attributes.connectionId::String                                         AS connection_id,
        attributes.functionName::String                                         AS function_name,
        attributes.type::String                                                 AS function_type,
        attributes.success::Bool                                                AS success,
        attributes.runtime::String                                              AS runtime,
        sum(value)                                                              AS value,
        sum(coalesce(attributes.telemetryBag.durationMs::Nullable(UInt64), 0))  AS duration_ms,
        sum(coalesce(attributes.telemetryBag.customLogs::Nullable(UInt64), 0))  AS custom_logs,
        sum(coalesce(attributes.telemetryBag.proxyCalls::Nullable(UInt64), 0))  AS proxy_calls
    FROM usage.raw_events
    WHERE type = 'usage.function_executions'
    GROUP BY day, account_id, environment_id, integration_id, connection_id, function_type, function_name, success, runtime
    `
];
