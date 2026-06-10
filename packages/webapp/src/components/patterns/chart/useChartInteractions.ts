import { useEffect, useRef, useState } from 'react';

/**
 * Legend/hover interaction state for a breakdown chart, keyed by the series' safe
 * keys (s0, s1, … / rest):
 * - `isolated`: clicking a series shows only it; clicking again shows all.
 * - `hidden`: individually toggled-off series.
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

    useEffect(() => {
        setHidden((prev) => (prev.size === 0 ? prev : new Set()));
        setIsolated(null);
        setHoveredKey(null);
    }, [seriesSignature]);

    const isSeriesHidden = (key: string) => (isolated !== null ? key !== isolated : hidden.has(key));

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
