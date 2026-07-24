/**
 * Next `expanded` list for opening/closing one row: adds `metric` (deduped, moved to the end) when
 * `open`, else removes it. Pure so the URL-persisted expand state (see `FreeUsage`) is unit-testable
 * without rendering.
 */
export function toggleExpandedMetric(expanded: string[], metric: string, open: boolean): string[] {
    const withoutMetric = expanded.filter((m) => m !== metric);
    return open ? [...withoutMetric, metric] : withoutMetric;
}
