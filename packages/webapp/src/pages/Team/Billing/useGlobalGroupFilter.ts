import { parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useMemo } from 'react';

import { useBillingUsageValueAvailability } from '@/hooks/usePlan';
import { isSearchableDimension, metricsSupportingDimension } from './usageBreakdown';

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
export function useGlobalGroupFilter(metrics: readonly UsageMetric[], env: string, timeframe: { start: string; end: string }) {
    const params = useMemo(() => {
        const p: Record<string, typeof breakdownParam> = {};
        for (const m of metrics) {
            p[`${m}.breakdown`] = breakdownParam;
            p[`${m}.filter`] = filterParam;
        }
        return p;
    }, [metrics]);
    const [values, setValues] = useQueryStates(params);

    // Backs the "skip metrics with no data for the filter value" behaviour below. Keyed on the same
    // top-N the filter popover uses so it reads the cache that's already warm from picking the value.
    const { cachedHasValue, ensureHasValue } = useBillingUsageValueAvailability(env, timeframe);

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
        async (sel: GroupFilterSelection) => {
            const updates: Record<string, string | null> = {};
            // Group: copy to supporting metrics when set; clear on every metric when null.
            if (sel.group !== null) {
                for (const m of supporting(sel.group)) updates[`${m}.breakdown`] = sel.group;
            } else {
                for (const m of metrics) updates[`${m}.breakdown`] = null;
            }
            // Filter: copy to supporting metrics when set; clear on every metric when null.
            if (sel.filter !== null) {
                const { dimension, value } = sel.filter;
                const filterValue = `${dimension}:${value}`;
                const targets = supporting(dimension);
                // Non-searchable dims have a small, fully-listed value set (the first page is
                // complete), so a value's absence from a metric's list reliably means "no data".
                if (!isSearchableDimension(dimension)) {
                    // Only fan the filter out to metrics that actually have data for this value, and
                    // clear it on the rest — so a metric with no data for the value falls back to its
                    // unfiltered chart instead of showing the raw value with "No data". On a lookup
                    // failure, default to applying (optimistic) rather than silently dropping it.
                    const availability = await Promise.all(targets.map((m) => ensureHasValue(m, dimension, value).catch(() => true)));
                    targets.forEach((m, i) => (updates[`${m}.filter`] = availability[i] ? filterValue : null));
                } else {
                    for (const m of targets) updates[`${m}.filter`] = filterValue;
                }
            } else {
                for (const m of metrics) updates[`${m}.filter`] = null;
            }
            if (Object.keys(updates).length > 0) void setValues(updates);
        },
        [setValues, supporting, metrics, ensureHasValue]
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
            let filterDiverges: boolean;
            if (sel.filter === null) {
                filterDiverges = others(metrics).some((m) => (values[`${m}.filter`] ?? '') !== '');
            } else {
                const { dimension, value } = sel.filter;
                const filterValue = `${dimension}:${value}`;
                // A non-searchable filter targets a metric to unfiltered ('') when the cache says it
                // has no data for the value — matching what applyToAll writes — so those panels don't
                // read as a permanent divergence and keep the button up. Stay optimistic (target the
                // value) while the cache is still cold.
                const fullyListed = !isSearchableDimension(dimension);
                filterDiverges = others(supporting(dimension)).some((m) => {
                    const target = fullyListed && cachedHasValue(m, dimension, value) === false ? '' : filterValue;
                    return (values[`${m}.filter`] ?? '') !== target;
                });
            }
            return groupDiverges || filterDiverges;
        },
        [values, supporting, metrics, cachedHasValue]
    );

    return { isDivergingFromGlobal, applyToAll };
}
