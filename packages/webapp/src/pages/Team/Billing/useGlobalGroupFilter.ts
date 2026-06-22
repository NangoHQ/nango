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
 * Owns the "Apply to all" group + filter state. `applyToAll` copies a panel's group
 * and/or filter to every metric that supports the respective dimension, in one URL
 * update — only the set slots are propagated (a null slot is left untouched on other
 * panels, never cleared). `isDivergingFromGlobal` reports whether applying would change
 * at least one other applicable panel — the signal for showing the button.
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

    const applyToAll = useCallback(
        (sel: GroupFilterSelection) => {
            const updates: Record<string, string | null> = {};
            if (sel.group !== null) {
                for (const m of metricsSupportingDimension(sel.group)) updates[`${m}.breakdown`] = sel.group;
            }
            if (sel.filter !== null) {
                const value = `${sel.filter.dimension}:${sel.filter.value}`;
                for (const m of metricsSupportingDimension(sel.filter.dimension)) updates[`${m}.filter`] = value;
            }
            if (Object.keys(updates).length > 0) void setValues(updates);
        },
        [setValues]
    );

    const isDivergingFromGlobal = useCallback(
        (metric: UsageMetric, sel: GroupFilterSelection): boolean => {
            const groupDiverges =
                sel.group !== null &&
                metricsSupportingDimension(sel.group)
                    .filter((m) => m !== metric)
                    .some((m) => (values[`${m}.breakdown`] ?? 'none') !== sel.group);
            const filterValue = sel.filter ? `${sel.filter.dimension}:${sel.filter.value}` : '';
            const filterDiverges =
                sel.filter !== null &&
                metricsSupportingDimension(sel.filter.dimension)
                    .filter((m) => m !== metric)
                    .some((m) => (values[`${m}.filter`] ?? '') !== filterValue);
            return groupDiverges || filterDiverges;
        },
        [values]
    );

    return { isDivergingFromGlobal, applyToAll };
}
