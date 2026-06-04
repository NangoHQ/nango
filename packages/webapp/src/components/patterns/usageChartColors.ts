/**
 * Categorical palette for usage breakdown charts, sourced from the design-system
 * chart tokens (`--color-chart-series-*`, imported via `index.css`). Only six
 * distinct hues exist, so series beyond the sixth cycle back through the palette
 * — the legend and tooltip disambiguate when colors repeat. The 'rest' rollup
 * always renders in a neutral gray, distinct from the categorical hues.
 */
const SERIES_COLORS = [
    'var(--color-chart-series-1)',
    'var(--color-chart-series-2)',
    'var(--color-chart-series-3)',
    'var(--color-chart-series-4)',
    'var(--color-chart-series-5)',
    'var(--color-chart-series-6)'
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
