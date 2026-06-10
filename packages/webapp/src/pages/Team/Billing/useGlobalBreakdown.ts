import { parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useMemo } from 'react';

import { metricsSupportingDimension } from './usageBreakdown';

import type { AnyBreakdownDimension } from './usageBreakdown';
import type { UsageMetric } from '@nangohq/types';

const breakdownParam = parseAsString.withDefault('none').withOptions({ history: 'replace' });

/**
 * Owns the "Apply to all" breakdown state. `applyToAll` writes a dimension to every
 * supporting metric in one URL update. `isDivergingFromGlobal` checks whether any
 * OTHER supporting panel currently has a different selection — the accurate signal for
 * when to show the "Apply to all" button (vs. the old last-applied tracker, which
 * stayed stale after individual panels were changed post-apply).
 */
export type GlobalBreakdownSelection = AnyBreakdownDimension | null;

export function useGlobalBreakdown(metrics: readonly UsageMetric[]) {
    const perMetricParams = useMemo(() => Object.fromEntries(metrics.map((m) => [`${m}.breakdown`, breakdownParam])), [metrics]);
    const [breakdowns, setBreakdowns] = useQueryStates(perMetricParams);

    const applyToAll = useCallback(
        (dimension: GlobalBreakdownSelection) => {
            const supportingMetrics = dimension === null ? metrics : metricsSupportingDimension(dimension);
            const updates: Record<string, string | null> = {};
            for (const m of supportingMetrics) updates[`${m}.breakdown`] = dimension;
            void setBreakdowns(updates);
        },
        [metrics, setBreakdowns]
    );

    const isDivergingFromGlobal = useCallback(
        (metric: UsageMetric, dimension: GlobalBreakdownSelection) => {
            const targetValue = dimension ?? 'none';
            const supportingMetrics = dimension === null ? metrics : metricsSupportingDimension(dimension);
            return supportingMetrics
                .filter((m) => m !== metric)
                .some((m) => (breakdowns[`${m}.breakdown`] ?? 'none') !== targetValue);
        },
        [breakdowns, metrics]
    );

    return { isDivergingFromGlobal, applyToAll };
}
