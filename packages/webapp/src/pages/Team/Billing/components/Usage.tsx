import { Info } from 'lucide-react';
import { parseAsString, useQueryStates } from 'nuqs';
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

    // "Apply to all": copy one panel's breakdown to every metric that supports it,
    // or clear every panel when the dimension is null ("No breakdown").
    const [, setBreakdowns] = useQueryStates(breakdownKeyMap);
    const applyToAll = useCallback(
        (dimension: AnyBreakdownDimension | null) => {
            const updates: Record<string, string | null> = {};
            if (dimension === null) {
                for (const m of METRICS) updates[`${m}.breakdown`] = null;
            } else {
                for (const m of metricsSupportingDimension(dimension)) updates[`${m}.breakdown`] = dimension;
            }
            void setBreakdowns(updates);
        },
        [setBreakdowns]
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
