/**
 * Categorical palette for usage breakdown charts: the design-system chart hues
 * plus a few extras, ordered most-distinct-first (one color per top-N series).
 * Colors cycle once exhausted; the 'rest' rollup renders neutral slate, outside
 * this palette.
 */
const SERIES_COLORS = [
    'var(--color-chart-series-1)', // cyan
    'var(--color-chart-series-3)', // amber
    'var(--color-chart-series-4)', // lavender
    'var(--color-chart-series-2)', // mint
    'var(--color-chart-series-5)', // pink
    'var(--color-chart-series-6)', // periwinkle
    '#ff8f70', // coral
    '#9dd36f', // lime
    '#7bc8f6', // sky
    '#b7a0e8' // violet
] as const;

/** Internal data/series key for the long-tail 'rest' bucket (avoids collision with a real dimension value named "rest"). */
export const REST_SERIES_KEY = '__rest__';

/** Neutral fill for the 'rest' bucket. */
export const REST_SERIES_COLOR = '#64748b'; // muted slate — neutral for the long-tail rollup without the flat gray

/** Semantic fills for the success/Status dimension, matching the logs screen's red/green. */
export const SUCCESS_SERIES_COLOR = 'var(--color-icon-success)';
export const FAILED_SERIES_COLOR = 'var(--color-icon-danger)';

// Stable value → color map, shared across every breakdown chart on the page so the
// SAME dimension value (e.g. integration "attio") always gets the SAME color —
// otherwise colors assigned by per-chart rank make different integrations share a
// color across charts, which reads as "the same thing". Colors are handed out in
// first-seen order and cycle once the palette is exhausted.
const colorByValue = new Map<string, string>();

/** Stable color for a dimension value, consistent across all charts (and the session). */
export function colorForValue(value: string): string {
    const existing = colorByValue.get(value);
    if (existing) {
        return existing;
    }
    const color = SERIES_COLORS[colorByValue.size % SERIES_COLORS.length];
    colorByValue.set(value, color);
    return color;
}
