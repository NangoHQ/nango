export const sql = [
    `
    CREATE TABLE IF NOT EXISTS {database:Identifier}.daily_function_executions_v2
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
        duration_seconds UInt64,
        compute_gbms     Float64,
        compute_gbs      Float64,
        custom_logs      UInt64,
        proxy_calls      UInt64
    )
    ENGINE = SummingMergeTree()
    PARTITION BY toYYYYMM(day)
    ORDER BY (account_id, day, environment_id, integration_id, connection_id, function_type, function_name, success, runtime)
    TTL day + INTERVAL 24 MONTH
    `,
    `
    CREATE MATERIALIZED VIEW IF NOT EXISTS {database:Identifier}.daily_function_executions_v2_mv
    TO {database:Identifier}.daily_function_executions_v2 AS
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
        sum(toUInt64(ceil(coalesce(attributes.telemetryBag.durationMs::Nullable(UInt64), 0) / 1000.0))) AS duration_seconds,
        sum(coalesce(attributes.telemetryBag.durationMs::Nullable(UInt64), 0) * coalesce(attributes.telemetryBag.memoryGb::Nullable(Float64), 0.0)) AS compute_gbms,
        sum(ceil(coalesce(attributes.telemetryBag.durationMs::Nullable(UInt64), 0) / 1000.0) * coalesce(attributes.telemetryBag.memoryGb::Nullable(Float64), 0.0)) AS compute_gbs,
        sum(coalesce(attributes.telemetryBag.customLogs::Nullable(UInt64), 0))  AS custom_logs,
        sum(coalesce(attributes.telemetryBag.proxyCalls::Nullable(UInt64), 0))  AS proxy_calls
    FROM {database:Identifier}.raw_events
    WHERE type = 'usage.function_executions'
    GROUP BY day, account_id, environment_id, integration_id, connection_id, function_type, function_name, success, runtime
    `
];
