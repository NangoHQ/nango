const dimensions = ['day', 'account_id', 'environment_id', 'integration_id', 'connection_id', 'function_name', 'function_type', 'success', 'runtime'] as const;
const insertColumns = [...dimensions, 'value', 'duration_ms', 'duration_seconds', 'compute_gbms', 'compute_gbs', 'custom_logs', 'proxy_calls'] as const;

export function segmentBSelectSql(database: string, day: string): string {
    return `
SELECT
    toDate(ts) AS day,
    account_id,
    attributes.environmentId::Int64 AS environment_id,
    attributes.integrationId::String AS integration_id,
    attributes.connectionId::String AS connection_id,
    attributes.functionName::String AS function_name,
    attributes.type::String AS function_type,
    attributes.success::Bool AS success,
    attributes.runtime::String AS runtime,
    sum(value) AS value,
    sum(coalesce(attributes.telemetryBag.durationMs::Nullable(UInt64), 0)) AS duration_ms,
    sum(toUInt64(ceil(coalesce(attributes.telemetryBag.durationMs::Nullable(UInt64), 0) / 1000.0))) AS duration_seconds,
    sum(coalesce(attributes.telemetryBag.durationMs::Nullable(UInt64), 0) * coalesce(attributes.telemetryBag.memoryGb::Nullable(Float64), 0.0)) AS compute_gbms,
    sum(ceil(coalesce(attributes.telemetryBag.durationMs::Nullable(UInt64), 0) / 1000.0) * coalesce(attributes.telemetryBag.memoryGb::Nullable(Float64), 0.0)) AS compute_gbs,
    sum(coalesce(attributes.telemetryBag.customLogs::Nullable(UInt64), 0)) AS custom_logs,
    sum(coalesce(attributes.telemetryBag.proxyCalls::Nullable(UInt64), 0)) AS proxy_calls
FROM ${database}.raw_events FINAL
WHERE type = 'usage.function_executions' AND toDate(ts) = toDate('${day}')
GROUP BY ${dimensions.join(', ')}
`.trim();
}

export function segmentASelectSql(database: string, day: string): string {
    return `
SELECT
    ${dimensions.join(', ')},
    sum(value) AS value,
    sum(duration_ms) AS duration_ms,
    toUInt64(0) AS duration_seconds,
    sum(compute_gbms) AS compute_gbms,
    toFloat64(0) AS compute_gbs,
    sum(custom_logs) AS custom_logs,
    sum(proxy_calls) AS proxy_calls
FROM ${database}.daily_function_executions
WHERE day = toDate('${day}')
GROUP BY ${dimensions.join(', ')}
`.trim();
}

export function deleteSql(database: string, day: string): string {
    return `ALTER TABLE ${database}.daily_function_executions_v2 DELETE WHERE day = toDate('${day}') SETTINGS mutations_sync = 2`;
}

export function insertSql(database: string, selectSql: string): string {
    return `INSERT INTO ${database}.daily_function_executions_v2 (${insertColumns.join(', ')}) ${selectSql}`;
}

export function verificationQueries(database: string, rawFloor: string): string {
    return `-- Per-day smoke check for missing days, unexpectedly zero totals, or implausible jumps.
-- This is a summary for manual comparison; it does not itself prove parity with v1 or raw events.
SELECT day, sum(value), sum(duration_ms), sum(duration_seconds), sum(compute_gbms), sum(compute_gbs) FROM ${database}.daily_function_executions_v2 GROUP BY day ORDER BY day;

-- For raw-backed rows, the sum of per-execution started seconds must be at least
-- ceil(total duration / 1000) and at most floor(total duration / 1000) + execution count.
-- A nonzero count is invalid. This cannot prove exact per-execution rounding after aggregation.
-- Exclude Segment A: before rawFloor, duration_seconds is intentionally zero.
SELECT count() FROM ${database}.daily_function_executions_v2 WHERE day >= toDate('${rawFloor}') AND (duration_seconds < intDivOrZero(duration_ms + 999, 1000) OR duration_seconds > intDivOrZero(duration_ms, 1000) + value);`;
}
