import { parseAsString, useQueryState, useQueryStates } from 'nuqs';
import { useCallback, useMemo } from 'react';

import { metricsSupportingDimension } from './usageBreakdown';

import type { AnyBreakdownDimension } from './usageBreakdown';
import type { UsageMetric } from '@nangohq/types';

const breakdownParam = parseAsString.withDefault('none').withOptions({ history: 'replace' });

/**
 * Owns the "Apply to all" breakdown state. `globalBreakdown` is the dimension last
 * fanned out (a panel shows its "Apply to all" button when its selection diverges
 * from it); `applyToAll` writes that dimension to every metric panel that supports
 * it in one URL update.
 */
export function useGlobalBreakdown(metrics: readonly UsageMetric[]) {
    const perMetricParams = useMemo(() => Object.fromEntries(metrics.map((m) => [`${m}.breakdown`, breakdownParam])), [metrics]);

    const [globalBreakdown, setGlobalBreakdown] = useQueryState('breakdown', breakdownParam);
    const [, setBreakdowns] = useQueryStates(perMetricParams);

    const applyToAll = useCallback(
        (dimension: AnyBreakdownDimension) => {
            void setGlobalBreakdown(dimension);
            const updates: Record<string, string> = {};
            for (const m of metricsSupportingDimension(dimension)) updates[`${m}.breakdown`] = dimension;
            void setBreakdowns(updates);
        },
        [setGlobalBreakdown, setBreakdowns]
    );

    return { globalBreakdown, applyToAll };
}
