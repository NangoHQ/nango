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
    function_logs: ['integration_id', 'connection_id', 'function_name', 'function_type', 'success', 'environment_id']
} as const satisfies { [M in UsageMetric]: readonly BreakdownDimensions[M][] };

/** Union of every breakdown dimension across all metrics. */
export type AnyBreakdownDimension = BreakdownDimensions[UsageMetric];

/**
 * Dimensions the backend accepts but we hide from the breakdown dropdowns.
 * Currently empty. NOTE: `environment_id` renders as the raw Postgres PK (e.g.
 * "105") because the backend doesn't yet resolve it to the env name — add it
 * back here (or land the backend swap) before customer rollout. See the plan's
 * follow-up TODOs.
 */
export const HIDDEN_BREAKDOWN_DIMENSIONS: readonly AnyBreakdownDimension[] = [];

/**
 * Metrics whose data model supports the given dimension (and that aren't hidden).
 * Used by the per-panel "Apply to all" action to fan a breakdown out only to the
 * panels where it's meaningful — e.g. Integration applies to all 7, but Model
 * only to records.
 */
export function metricsSupportingDimension(dimension: AnyBreakdownDimension): UsageMetric[] {
    if (HIDDEN_BREAKDOWN_DIMENSIONS.includes(dimension)) {
        return [];
    }
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
    environment_id: 'Environment'
};

/**
 * Display label for a dimension value. Only `success` needs mapping: the backend
 * emits the boolean strings `'true'`/`'false'`, which we show as Success/Failed
 * to match the wording used on the logs screen. Other dimensions are shown
 * verbatim (`environment_id` is already resolved to a name server-side).
 */
export function formatDimensionValue(dimension: AnyBreakdownDimension, value: string): string {
    if (dimension === 'success') {
        if (value === 'true') return 'Success';
        if (value === 'false') return 'Failed';
    }
    return value;
}

/**
 * Top-N dimension values requested per breakdown; the long tail collapses into a
 * single 'rest' bucket. Fixed for now (no user-facing picker) — the backend caps
 * it server-side. Reintroduce a presets array here if a Top-N control comes back.
 */
export const DEFAULT_TOP_N = 10;
