import { Info } from 'lucide-react';
import { useMemo } from 'react';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { StyledLink } from '@/components/ui/StyledLink';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useApiGetBillingUsage } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { useBreakdownEnabled } from '../useBreakdownEnabled';
import { useGlobalBreakdown } from '../useGlobalBreakdown';
import { UsageChartCard } from './UsageChartCard';

import type { DBPlan, UsageMetric } from '@nangohq/types';

// Render order for the usage panels.
const METRICS: UsageMetric[] = ['connections', 'proxy', 'function_compute_gbms', 'function_executions', 'function_logs', 'records', 'webhook_forwards'];

// Plans on the current usage model. Any plan not listed here is treated as a legacy plan (different usage metrics).
// Typed against `DBPlan['name']` so a renamed or removed plan fails to compile instead of silently drifting.
const CURRENT_PLAN_NAMES: readonly DBPlan['name'][] = ['free', 'free-uncapped', 'startup-deal', 'enterprise-cloud-hosted', 'starter-v2', 'growth-v2'];

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

    // Pin the whole dashboard to ClickHouse when breakdown is active so headline
    // totals match the per-panel breakdowns (which always query ClickHouse).
    const breakdownEnabled = useBreakdownEnabled();
    const source = breakdownEnabled ? 'clickhouse' : undefined;

    const { data: usage, isLoading, error: usageError } = useApiGetBillingUsage(env, timeframe, source);

    const { isDivergingFromGlobal, applyToAll } = useGlobalBreakdown(METRICS);

    if (usageError) {
        return <CriticalErrorAlert message="Error loading usage" />;
    }

    const isLegacyPlan = plan && !CURRENT_PLAN_NAMES.includes(plan.name);
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
                    isDivergingFromGlobal={isDivergingFromGlobal}
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
