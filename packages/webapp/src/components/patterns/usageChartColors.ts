/**
 * Categorical palette for usage breakdown charts. The first six come from the
 * design-system chart tokens (`--color-chart-series-*`, imported via `index.css`);
 * the rest are extra hues so a Top-N breakdown (up to ~10–12 series) doesn't
 * repeat colors as often. (Ideally these extras become design-system tokens too.)
 * Colors still cycle past the end of the list — the legend and tooltip
 * disambiguate when they repeat. The 'rest' rollup always renders neutral gray.
 */
const SERIES_COLORS = [
    'var(--color-chart-series-1)',
    'var(--color-chart-series-2)',
    'var(--color-chart-series-3)',
    'var(--color-chart-series-4)',
    'var(--color-chart-series-5)',
    'var(--color-chart-series-6)',
    '#f59e42', // orange
    '#a3e635', // lime
    '#2dd4bf', // teal
    '#fb7185', // rose
    '#818cf8', // indigo
    '#c9a06b' // tan
] as const;

/** Internal data/series key for the long-tail 'rest' bucket (avoids collision with a real dimension value named "rest"). */
export const REST_SERIES_KEY = '__rest__';

/** Neutral fill for the 'rest' bucket. */
export const REST_SERIES_COLOR = 'var(--color-icon-muted)';

/** Semantic fills for the success/Status dimension, matching the logs screen's red/green. */
export const SUCCESS_SERIES_COLOR = 'var(--color-icon-success)';
export const FAILED_SERIES_COLOR = 'var(--color-icon-danger)';

/** Color for the Nth breakdown series, cycling once the palette is exhausted. */
export function seriesColorAt(index: number): string {
    return SERIES_COLORS[index % SERIES_COLORS.length];
}
