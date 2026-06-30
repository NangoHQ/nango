/**
 * One stacked series in a breakdown chart. `key` is a synthetic CSS-safe id (s0,
 * s1, … / rest); the real value lives in `label`, and `color` is applied directly
 * to the chart elements.
 */
export interface ChartSeries {
    key: string;
    label: string;
    color: string;
    usage: { timeframeStart: string | Date; quantity: number }[];
    /** Raw dimension value behind this series (e.g. `hubspot`, `true`) — used to drill in. Absent on the 'rest' rollup. */
    value?: string;
    /** The 'rest' rollup series: an aggregate of the long tail, so it isn't a single value and can't be drilled into. */
    isRest?: boolean;
}
