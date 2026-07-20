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

/** Nearest "nice" number (1, 2, 2.5, 5, 10 × 10ⁿ) ≥ x — for round tick steps. Non-positive x → 1. */
export function niceStep(x: number): number {
    if (x <= 0) return 1;
    const base = 10 ** Math.floor(Math.log10(x));
    const frac = x / base;
    return (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10) * base;
}

/** Round Y-axis ticks (0…top) so the axis reads "0, 50K, 100K", with the cap always a labelled tick and ~10% headroom above. */
export function niceCapAxis(dataMax: number, capLine: number): { max: number; ticks: number[] } {
    const top = Math.max(dataMax, capLine, 1);
    const step = niceStep(top / 5);
    const ticks: number[] = [];
    for (let t = 0; t <= top + step / 2; t += step) ticks.push(t);
    // Force the cap in as a tick even if it's off the step grid.
    if (!ticks.some((t) => Math.abs(t - capLine) < step / 100)) {
        ticks.push(capLine);
        ticks.sort((a, b) => a - b);
    }
    return { max: top * 1.1, ticks };
}
