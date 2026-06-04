import { Info } from 'lucide-react';
import { parseAsString, useQueryState, useQueryStates } from 'nuqs';
import { useCallback, useMemo } from 'react';

import { UsageChartCard } from './UsageChartCard';
import { isBreakdownAvailableForMonth, metricsSupportingDimension } from '../usageBreakdown';
import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { StyledLink } from '@/components/ui/StyledLink';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useApiGetBillingUsage } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { useFeatureFlagsStore } from '@/store/feature-flags';

import type { AnyBreakdownDimension } from '../usageBreakdown';
import type { UsageMetric } from '@nangohq/types';

// Render order for the usage panels.
const METRICS: UsageMetric[] = ['connections', 'proxy', 'function_compute_gbms', 'function_executions', 'function_logs', 'records', 'webhook_forwards'];

// nuqs keyMap for every panel's `<metric>.breakdown` param, so "Apply to all" can
// set them in one go. Built once.
const breakdownKeyMap = Object.fromEntries(METRICS.map((m) => [`${m}.breakdown`, parseAsString.withDefault('none').withOptions({ history: 'replace' })]));

interface UsageProps {
    selectedMonth: Date;
}

export const Usage: React.FC<UsageProps> = ({ selectedMonth }) => {
    const env = useStore((state) => state.env);
    const { data: environmentData } = useEnvironment(env);
    const plan = environmentData?.plan;

    // Calculate timeframe for the selected month
    const timeframe = useMemo(() => {
        const start = new Date(Date.UTC(selectedMonth.getUTCFullYear(), selectedMonth.getUTCMonth(), 1));
        const end = new Date(Date.UTC(selectedMonth.getUTCFullYear(), selectedMonth.getUTCMonth() + 1, 1));
        return {
            start: start.toISOString(),
            end: end.toISOString()
        };
    }, [selectedMonth]);

    // When the breakdown feature is active for an eligible month, pin the whole
    // dashboard (including headline totals) to ClickHouse so totals match the
    // per-panel breakdowns; otherwise keep the env / localStorage default source.
    const breakdownFlag = useFeatureFlagsStore((s) => s.usageBreakdown);
    const sourceOverride = breakdownFlag && isBreakdownAvailableForMonth(selectedMonth) ? 'clickhouse' : undefined;

    const { data: usage, isLoading, error: usageError } = useApiGetBillingUsage(env, timeframe, sourceOverride);

    // The global breakdown: the dimension "Apply to all" last propagated. A panel
    // shows its "Apply to all" button when its own selection diverges from this.
    const [globalBreakdown, setGlobalBreakdown] = useQueryState('breakdown', parseAsString.withDefault('none').withOptions({ history: 'replace' }));
    const [, setBreakdowns] = useQueryStates(breakdownKeyMap);

    // "Apply to all": make a panel's dimension the global one and copy it to every
    // metric that supports it.
    const applyToAll = useCallback(
        (dimension: AnyBreakdownDimension) => {
            void setGlobalBreakdown(dimension);
            const updates: Record<string, string> = {};
            for (const m of metricsSupportingDimension(dimension)) updates[`${m}.breakdown`] = dimension;
            void setBreakdowns(updates);
        },
        [setGlobalBreakdown, setBreakdowns]
    );

    if (usageError) {
        return <CriticalErrorAlert message="Error loading usage" />;
    }

    const isLegacyPlan = plan && !['free', 'starter-v2', 'growth-v2'].includes(plan.name);
    return (
        <div className="w-full flex flex-col gap-6">
            {isLegacyPlan && (
                <Alert variant="info">
                    <Info />
                    <AlertTitle>You&apos;re on a legacy plan</AlertTitle>
                    <AlertDescription>
                        Legacy plans have different usage metrics.
                        {usage?.data.customer.portalUrl && (
                            <>
                                {' '}
                                You can see your usage in the{' '}
                                <StyledLink icon to={usage?.data.customer.portalUrl} type="external" variant="info">
                                    billing portal
                                </StyledLink>
                            </>
                        )}
                    </AlertDescription>
                </Alert>
            )}

            {METRICS.map((metric) => (
                <UsageChartCard
                    key={metric}
                    metric={metric}
                    data={usage?.data.usage[metric]}
                    isLoading={isLoading}
                    env={env}
                    timeframe={timeframe}
                    selectedMonth={selectedMonth}
                    globalBreakdown={globalBreakdown}
                    onApplyToAll={applyToAll}
                />
            ))}

            {usage?.data.customer.portalUrl && (
                <StyledLink icon to={usage.data.customer.portalUrl} type="external">
                    View invoice details
                </StyledLink>
            )}
        </div>
    );
};
