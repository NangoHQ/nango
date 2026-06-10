import { parseAsString, useQueryState } from 'nuqs';
import { useMemo } from 'react';

import { BreakdownControls } from './BreakdownControls';
import { BREAKDOWN_DIMENSIONS, DEFAULT_TOP_N, metricsSupportingDimension } from '../usageBreakdown';
import { toChartSeries } from '../usageChartSeries';
import { useBreakdownEnabled } from '../useBreakdownEnabled';
import { ChartCard } from '@/components/patterns/chart';
import { useApiGetBillingUsageBreakdown } from '@/hooks/usePlan';

import type { AnyBreakdownDimension } from '../usageBreakdown';
import type { GlobalBreakdownSelection } from '../useGlobalBreakdown';
import type { ChartSeries } from '@/components/patterns/chart';
import type { ApiBillingUsageMetric, UsageMetric } from '@nangohq/types';

const NONE = 'none';

interface UsageChartCardProps {
    metric: UsageMetric;
    data?: ApiBillingUsageMetric;
    isLoading: boolean;
    env: string;
    timeframe: { start: string; end: string };
    /** Returns true if applying this panel's selection would change at least one other applicable panel. */
    isDivergingFromGlobal: (metric: UsageMetric, dimension: GlobalBreakdownSelection) => boolean;
    /** Apply this panel's selection to every applicable metric. */
    onApplyToAll: (dimension: GlobalBreakdownSelection) => void;
}

/**
 * One billing usage panel: the base single-series chart, plus — when the breakdown
 * view is enabled — a dimension dropdown that stacks a per-dimension breakdown. The
 * headline total always comes from the base metric.
 */
export const UsageChartCard: React.FC<UsageChartCardProps> = ({ metric, data, isLoading, env, timeframe, isDivergingFromGlobal, onApplyToAll }) => {
    const showControls = useBreakdownEnabled();

    // This panel's selected dimension (default 'none'), persisted in the URL.
    const dimensions = BREAKDOWN_DIMENSIONS[metric] as readonly AnyBreakdownDimension[];
    const [dimParam, setDimParam] = useQueryState(`${metric}.breakdown`, parseAsString.withDefault(NONE).withOptions({ history: 'replace' }));
    const dimension: AnyBreakdownDimension | null = dimensions.includes(dimParam as AnyBreakdownDimension) ? (dimParam as AnyBreakdownDimension) : null;
    const inBreakdownMode = showControls && dimension !== null;

    const breakdownQuery = useApiGetBillingUsageBreakdown(env, timeframe, metric, dimension, DEFAULT_TOP_N, { enabled: inBreakdownMode });
    const breakdownEntries = breakdownQuery.data?.data.usage[metric]?.breakdown;

    const breakdownSeries = useMemo<ChartSeries[] | undefined>(() => {
        if (!showControls || dimension === null) return undefined;
        return breakdownEntries ? toChartSeries(breakdownEntries, dimension) : [];
    }, [showControls, dimension, breakdownEntries]);

    // "Apply to all" shows when at least one other applicable panel has a different selection.
    const canApplyToAll = (dimension === null || metricsSupportingDimension(dimension).length > 1) && isDivergingFromGlobal(metric, dimension);

    const headerActions = showControls ? (
        <BreakdownControls
            dimensions={dimensions}
            dimension={dimension}
            onChange={(d) => void setDimParam(d)}
            canApplyToAll={canApplyToAll}
            onApplyToAll={() => onApplyToAll(dimension)}
        />
    ) : undefined;

    return (
        <ChartCard
            data={data}
            isLoading={isLoading}
            timeframe={timeframe}
            headerActions={headerActions}
            breakdownSeries={breakdownSeries}
            breakdownLoading={breakdownQuery.isLoading}
            breakdownError={breakdownQuery.isError}
        />
    );
};
