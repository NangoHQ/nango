/**
 * The headline shows the precise total (e.g. "2,172.43"); axis ticks use the shared compact
 * formatter (in BreakdownChart) so big numbers don't clip.
 */
export function formatExact(quantity: number): string {
    return quantity.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * A filtered headline is a slice of the metric's unfiltered total; this is the slice's share, so a
 * count like "5,813 failed" can carry its denominator ("5.3% of 271,916"). Tiny non-zero slices
 * read "<0.1%" rather than rounding to a misleading "0%".
 */
export function formatShare(part: number, whole: number): string {
    const pct = (part / whole) * 100;
    if (pct > 0 && pct < 0.1) return '<0.1%';
    return `${pct.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
}
