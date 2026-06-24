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
    data_transfer: ['environment_id', 'integration_id', 'connection_id', 'package', 'callsite']
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

/**
 * Parse a `${metric}.filter` URL value (`<dimension>:<value>`) into its parts. Splits on the
 * FIRST ':' to mirror the backend, so a value containing ':' (e.g. a URL) survives intact.
 * Returns null for malformed input, or for a dimension the metric doesn't support (e.g. a stale
 * deep-link from before the dimension list changed).
 */
export function parseFilterParam(raw: string, allowed: readonly AnyBreakdownDimension[]): { dimension: AnyBreakdownDimension; value: string } | null {
    const colon = raw.indexOf(':');
    const hasDimensionAndValue = colon > 0 && colon < raw.length - 1;
    if (!hasDimensionAndValue) return null;

    const dimension = raw.slice(0, colon) as AnyBreakdownDimension;
    if (!allowed.includes(dimension)) return null;

    return { dimension, value: raw.slice(colon + 1) };
}

/**
 * Dimensions whose filter values are a small, fully-listed, closed set, so the Filter typeahead
 * never needs free text: `environment_id` (a handful of envs, and the stored value is an id the
 * user can't type) and `success` (just true/false, shown as Success/Failed). Free text on these
 * could only commit a value the backend won't match — a name where it wants an id, or "succ"
 * where it wants "true" — silently yielding an empty chart. Open-ended id/name dimensions
 * (integration, connection, model, …) still allow free text to reach long-tail 'Rest' values.
 */
const ENUMERATED_DIMENSIONS = new Set<AnyBreakdownDimension>(['environment_id', 'success']);

/** Whether the Filter typeahead may commit a typed-but-unlisted value for this dimension. */
export function allowsFreeTextFilter(dimension: AnyBreakdownDimension): boolean {
    return !ENUMERATED_DIMENSIONS.has(dimension);
}

/**
 * The breakdown dimension actually sent to the query. Group and filter may target the same
 * dimension — the backend rejects that degenerate split, so the filter wins and the grouping is
 * dropped from the query. (The grouping stays in the URL, so clearing the filter restores it.)
 */
export function resolveBreakdownDimension(
    group: AnyBreakdownDimension | null,
    filter: { dimension: AnyBreakdownDimension } | null
): AnyBreakdownDimension | null {
    return group && filter && group === filter.dimension ? null : group;
}

/** Top-N dimension values requested per breakdown; the long tail collapses into a single 'rest' bucket. */
export const DEFAULT_TOP_N = 10;

/**
 * How many values the Filter dropdown lists per dimension — more than the chart's top-N so more
 * are directly pickable (incl. ones in the chart's 'rest'). Matches the backend's TOP_N_BREAKDOWN_CAP;
 * the searchable, height-capped pane handles the length. Reaching beyond this is server-side search (NAN-6038).
 */
export const FILTER_VALUES_TOP_N = 25;

/**
 * Earliest month (UTC epoch ms) with ClickHouse granular data; the month picker is
 * floored here while the breakdown view is active. A primitive — not a shared `Date` —
 * so it can't be mutated by reference.
 */
export const EARLIEST_USAGE_MONTH_MS = Date.UTC(2026, 5, 1); // June 2026
