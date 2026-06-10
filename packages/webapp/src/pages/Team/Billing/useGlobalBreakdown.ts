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
export function useGlobalBreakdown(metrics: readonly UsageMetric[]) {
    const perMetricParams = useMemo(() => Object.fromEntries(metrics.map((m) => [`${m}.breakdown`, breakdownParam])), [metrics]);
    const [breakdowns, setBreakdowns] = useQueryStates(perMetricParams);

    const applyToAll = useCallback(
        (dimension: AnyBreakdownDimension) => {
            const updates: Record<string, string> = {};
            for (const m of metricsSupportingDimension(dimension)) updates[`${m}.breakdown`] = dimension;
            void setBreakdowns(updates);
        },
        [setBreakdowns]
    );

    const isDivergingFromGlobal = useCallback(
        (metric: UsageMetric, dimension: AnyBreakdownDimension) =>
            metricsSupportingDimension(dimension)
                .filter((m) => m !== metric)
                .some((m) => (breakdowns[`${m}.breakdown`] ?? 'none') !== dimension),
        [breakdowns]
    );

    return { isDivergingFromGlobal, applyToAll };
}
