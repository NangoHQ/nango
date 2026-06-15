/**
 * Categorical palette for usage breakdown charts: the design-system chart hues
 * (--color-chart-series-*) plus a few interim hex extras, ordered most-distinct-
 * first (one color per top-N series). The 'rest' rollup renders neutral slate,
 * outside this palette.
 *
 * The raw hex extras are interim — to be promoted to design-system
 * --chart-series-* tokens (with light/dark theming) in a follow-up: NAN-5927.
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

// Semantic fills for the success/Status dimension, matching the logs screen's red/green.
const SUCCESS_SERIES_COLOR = 'var(--color-icon-success)';
const FAILED_SERIES_COLOR = 'var(--color-icon-danger)';

// Color assignment for breakdown series, kept PER DIMENSION (integration_id, model, …).
//
// Why per-dimension:
//   • Same value → same color everywhere: integration "attio" is one color across every chart
//     on the page, which is what makes a breakdown readable.
//   • Dimensions don't share palette slots: a chart sliced by integration can't be pushed off
//     the palette by the model/connection values shown elsewhere.
//
// How clashes are avoided:
//   • Within a dimension, colors are handed out in first-seen order. With ≤10 distinct values
//     (the common case) every value gets its own color, so no chart can clash.
//   • Past 10 values the palette is exhausted and two values share a color; colorsForValues()
//     then de-conflicts them per chart (see below), so a clash is never visible inside a single
//     chart. The only trade-off: a bumped tail value may show a different color in the one chart
//     where it collided.
const colorByDimension = new Map<string, Map<string, string>>();

/** The stable (preferred) color for a value within its dimension, assigning one on first sight. */
function preferredColor(value: string, dimensionKey: string): string {
    let assigned = colorByDimension.get(dimensionKey);
    if (!assigned) {
        assigned = new Map<string, string>();
        colorByDimension.set(dimensionKey, assigned);
    }
    const existing = assigned.get(value);
    if (existing) {
        return existing;
    }
    const color = SERIES_COLORS[assigned.size % SERIES_COLORS.length];
    assigned.set(value, color);
    return color;
}

/**
 * Colors for one chart's breakdown series, keyed by value. Guarantees that no two values in
 * the SAME chart share a color (the palette has one slot per top-N series), while keeping each
 * value's color stable across charts via the per-dimension assignment above. Pass the values
 * in display (rank) order so the largest series win ties.
 *
 * The Status ('success') dimension is special: it gets the semantic red/green from the logs
 * screen and is never de-conflicted (only two values, each with a fixed meaning).
 */
export function colorsForValues(values: string[], dimension?: string): Map<string, string> {
    if (dimension === 'success') {
        return new Map(values.map((value) => [value, value === 'Failed' ? FAILED_SERIES_COLOR : SUCCESS_SERIES_COLOR]));
    }

    const dimensionKey = dimension ?? '';
    const result = new Map<string, string>();
    const usedInChart = new Set<string>();

    // Pass 1: give each value its stable (cross-chart) color where that color is still free in
    // this chart. Higher-ranked values come first, so they win ties.
    for (const value of values) {
        if (result.has(value)) continue; // duplicate label — already resolved, don't take a second slot
        const preferred = preferredColor(value, dimensionKey);
        if (!usedInChart.has(preferred)) {
            result.set(value, preferred);
            usedInChart.add(preferred);
        }
    }

    // Pass 2: any value whose stable color was already taken in this chart (only possible once
    // the dimension has >10 distinct values) is bumped to the next free palette color. This is
    // local to the chart — the per-dimension assignment is left untouched, so other charts keep
    // the value's stable color.
    for (const value of values) {
        if (result.has(value)) continue;
        const free = SERIES_COLORS.find((color) => !usedInChart.has(color));
        // With top-N (DEFAULT_TOP_N) == palette size (10) a free color always exists here. The
        // fallback only triggers if a future top-N exceeds the palette, in which case within-
        // chart uniqueness can no longer be guaranteed and the palette repeats.
        const color = free ?? SERIES_COLORS[result.size % SERIES_COLORS.length];
        result.set(value, color);
        usedInChart.add(color);
    }

    return result;
}

/** Test-only: clear the per-dimension color assignments so unit tests aren't order-dependent. */
export function resetUsageChartColorsForTests(): void {
    colorByDimension.clear();
}
