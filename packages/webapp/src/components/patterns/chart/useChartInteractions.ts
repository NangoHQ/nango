import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Legend/hover interaction state for a breakdown chart, keyed by the series' safe
 * keys (s0, s1, … / rest). All client-side — chart and legend clicks only change
 * what's drawn, never the underlying query (filtering lives on the Filter control):
 * - `isolated`: clicking a series (band or legend label) shows only it; click again shows all.
 * - `hidden`: individually toggled-off series (the legend swatch).
 * - `hoveredKey`: the emphasized series (others dim).
 *
 * `seriesSignature` identifies the current set of series; the state resets when it
 * changes, since the positional keys get reused across datasets.
 */
export function useChartInteractions(seriesSignature: string) {
    const [hidden, setHidden] = useState<Set<string>>(new Set());
    const [isolated, setIsolated] = useState<string | null>(null);
    const [hoveredKey, setHoveredKey] = useState<string | null>(null);

    // Clearing the hover is debounced so moving across the 1px seams between contiguous
    // bands doesn't blink back to the unhovered state.
    const clearHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hoverSeries = (key: string) => {
        if (clearHoverTimer.current) clearTimeout(clearHoverTimer.current);
        clearHoverTimer.current = null;
        setHoveredKey(key);
    };
    const unhoverSeries = () => {
        if (clearHoverTimer.current) clearTimeout(clearHoverTimer.current);
        clearHoverTimer.current = setTimeout(() => setHoveredKey(null), 80);
    };
    useEffect(
        () => () => {
            if (clearHoverTimer.current) clearTimeout(clearHoverTimer.current);
        },
        []
    );

    // Reset during render (not in a passive effect) when the set of series changes — the
    // positional keys (s0, s1, …) get reused, so a post-paint reset would let one frame
    // inherit stale hidden/isolated state and flash the wrong series.
    const [prevSignature, setPrevSignature] = useState(seriesSignature);
    if (seriesSignature !== prevSignature) {
        setPrevSignature(seriesSignature);
        setHidden((prev) => (prev.size === 0 ? prev : new Set()));
        setIsolated(null);
        setHoveredKey(null);
    }

    // Stable identity (deps: isolated/hidden) so memos keyed on it — e.g. BreakdownChart's cap-axis
    // computation — only recompute when the visible set actually changes, not on every render.
    const isSeriesHidden = useCallback((key: string) => (isolated !== null ? key !== isolated : hidden.has(key)), [isolated, hidden]);

    const toggleIsolate = (key: string) => {
        // Isolating clears any individually-hidden series, so toggling isolation back off
        // reveals every series again. (Keep the same Set when already empty to skip a render.)
        setHidden((prev) => (prev.size === 0 ? prev : new Set()));
        setIsolated((prev) => (prev === key ? null : key));
    };
    const toggleHidden = (key: string) => {
        // Clear isolation and the transient hover too: the hovered series may be the one
        // being hidden, which would otherwise leave the rest of the chart dimmed.
        setIsolated(null);
        setHoveredKey(null);
        setHidden((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    /** A series dims when another series is hovered. */
    const dimByHover = (key: string) => hoveredKey !== null && hoveredKey !== key;

    return { hidden, hoveredKey, isSeriesHidden, toggleIsolate, toggleHidden, hoverSeries, unhoverSeries, dimByHover };
}

export type ChartInteractions = ReturnType<typeof useChartInteractions>;
