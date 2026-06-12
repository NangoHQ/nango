import type { BreakdownDimensions, UsageMetric } from '@nangohq/types';

/**
 * Per-metric whitelist of breakdown dimensions, mirroring the runtime
 * `BREAKDOWN_DIMENSIONS` const in `@nangohq/usage` (a server package the webapp
 * cannot import). The `satisfies` clause keeps each metric constrained to the
 * dimensions the backend accepts for it (`BreakdownDimensions` in `@nangohq/types`).
 */
export const BREAKDOWN_DIMENSIONS = {
    connections: ['integration_id', 'environment_id'],
    records: ['integration_id', 'connection_id', 'model', 'environment_id'],
    proxy: ['integration_id', 'connection_id', 'success', 'environment_id'],
    webhook_forwards: ['integration_id', 'connection_id', 'success', 'environment_id'],
    function_executions: ['integration_id', 'connection_id', 'function_name', 'function_type', 'success', 'environment_id'],
    function_compute_gbms: ['integration_id', 'connection_id', 'function_name', 'function_type', 'success', 'environment_id'],
    function_logs: ['integration_id', 'connection_id', 'function_name', 'function_type', 'success', 'environment_id'],
    data_transfer: ['environment_id', 'integration_id', 'connection_id', 'direction', 'package', 'callsite']
} as const satisfies { [M in UsageMetric]: readonly BreakdownDimensions[M][] };

/** Union of every breakdown dimension across all metrics. */
export type AnyBreakdownDimension = BreakdownDimensions[UsageMetric];

/**
 * Metrics whose data model supports the given dimension. Used by "Apply to all"
 * to fan a breakdown out only to the panels where it's meaningful — e.g.
 * Integration applies to all 7, but Model only to records.
 */
export function metricsSupportingDimension(dimension: AnyBreakdownDimension): UsageMetric[] {
    return (Object.keys(BREAKDOWN_DIMENSIONS) as UsageMetric[]).filter((m) => (BREAKDOWN_DIMENSIONS[m] as readonly string[]).includes(dimension));
}

/** Human-readable label for each dimension, shown in the breakdown dropdown. */
export const DIMENSION_LABELS: Record<AnyBreakdownDimension, string> = {
    integration_id: 'Integration',
    connection_id: 'Connection',
    model: 'Model',
    function_name: 'Function name',
    function_type: 'Function type',
    success: 'Status',
    environment_id: 'Environment',
    direction: 'Direction',
    package: 'Package',
    callsite: 'Callsite'
};

/**
 * Display label for a dimension value. Only `success` needs mapping: the backend
 * emits the boolean strings `'true'`/`'false'`, which we show as Success/Failed to
 * match the logs screen. Other dimensions are shown verbatim.
 */
export function formatDimensionValue(dimension: AnyBreakdownDimension, value: string): string {
    if (dimension === 'success') {
        if (value === 'true') return 'Success';
        if (value === 'false') return 'Failed';
    }
    return value;
}

/** Top-N dimension values requested per breakdown; the long tail collapses into a single 'rest' bucket. */
export const DEFAULT_TOP_N = 10;

/**
 * Earliest month (UTC epoch ms) with ClickHouse granular data; the month picker is
 * floored here while the breakdown view is active. A primitive — not a shared `Date` —
 * so it can't be mutated by reference.
 */
export const EARLIEST_USAGE_MONTH_MS = Date.UTC(2026, 5, 1); // June 2026
