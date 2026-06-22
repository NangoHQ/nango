import { parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useMemo } from 'react';

import { metricsSupportingDimension } from './usageBreakdown';

import type { AnyBreakdownDimension } from './usageBreakdown';
import type { UsageMetric } from '@nangohq/types';

const breakdownParam = parseAsString.withDefault('none').withOptions({ history: 'replace' });
const filterParam = parseAsString.withDefault('').withOptions({ history: 'replace' });

/** A panel's group + filter selection — the unit "Apply to all" fans out. */
export interface GroupFilterSelection {
    group: AnyBreakdownDimension | null;
    filter: { dimension: AnyBreakdownDimension; value: string } | null;
}

/**
 * Owns the "Apply to all" group + filter state. `applyToAll` makes every applicable
 * panel match this panel's group AND filter in one URL update: a set slot is copied to
 * every metric that supports its dimension; a cleared (null) slot is cleared on every
 * metric — so removing a filter and re-applying propagates the removal too.
 * `isDivergingFromGlobal` reports whether applying would change at least one other
 * applicable panel — the signal for showing the button.
 */
export function useGlobalGroupFilter(metrics: readonly UsageMetric[]) {
    const params = useMemo(() => {
        const p: Record<string, typeof breakdownParam> = {};
        for (const m of metrics) {
            p[`${m}.breakdown`] = breakdownParam;
            p[`${m}.filter`] = filterParam;
        }
        return p;
    }, [metrics]);
    const [values, setValues] = useQueryStates(params);

    // Metrics this hook manages (i.e. on screen) that support `dim`. Intersecting with
    // `metrics` stops metrics that aren't displayed — and so never appear in the URL —
    // from reading as a permanent divergence.
    const supporting = useCallback(
        (dim: AnyBreakdownDimension): UsageMetric[] => {
            const supp = metricsSupportingDimension(dim);
            return metrics.filter((m) => supp.includes(m));
        },
        [metrics]
    );

    const applyToAll = useCallback(
        (sel: GroupFilterSelection) => {
            const updates: Record<string, string | null> = {};
            // Group: copy to supporting metrics when set; clear on every metric when null.
            if (sel.group !== null) {
                for (const m of supporting(sel.group)) updates[`${m}.breakdown`] = sel.group;
            } else {
                for (const m of metrics) updates[`${m}.breakdown`] = null;
            }
            // Filter: copy to supporting metrics when set; clear on every metric when null.
            if (sel.filter !== null) {
                const value = `${sel.filter.dimension}:${sel.filter.value}`;
                for (const m of supporting(sel.filter.dimension)) updates[`${m}.filter`] = value;
            } else {
                for (const m of metrics) updates[`${m}.filter`] = null;
            }
            if (Object.keys(updates).length > 0) void setValues(updates);
        },
        [setValues, supporting, metrics]
    );

    const isDivergingFromGlobal = useCallback(
        (metric: UsageMetric, sel: GroupFilterSelection): boolean => {
            // Nothing to propagate from a panel with neither slot set — don't offer
            // "Apply to all" on an unconfigured panel (it would read as "clear everyone").
            if (sel.group === null && sel.filter === null) return false;
            const others = (ms: readonly UsageMetric[]) => ms.filter((m) => m !== metric);
            // A set slot targets the metrics supporting its dimension; a cleared slot
            // targets every metric (the 'none'/'' default). Diverges if any other
            // applicable panel doesn't already match the target — including a panel that
            // still carries a filter this panel has cleared.
            const groupTargets = sel.group !== null ? supporting(sel.group) : metrics;
            const groupTarget = sel.group ?? 'none';
            const groupDiverges = others(groupTargets).some((m) => (values[`${m}.breakdown`] ?? 'none') !== groupTarget);
            const filterTargets = sel.filter !== null ? supporting(sel.filter.dimension) : metrics;
            const filterTarget = sel.filter ? `${sel.filter.dimension}:${sel.filter.value}` : '';
            const filterDiverges = others(filterTargets).some((m) => (values[`${m}.filter`] ?? '') !== filterTarget);
            return groupDiverges || filterDiverges;
        },
        [values, supporting, metrics]
    );

    return { isDivergingFromGlobal, applyToAll };
}
