import { Info } from 'lucide-react';
import { useMemo } from 'react';

import { ChartCard } from '@/components-v2/ChartCard';
import { CriticalErrorAlert } from '@/components-v2/CriticalErrorAlert';
import { StyledLink } from '@/components-v2/StyledLink';
import { Alert, AlertDescription, AlertTitle } from '@/components-v2/ui/alert';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useApiGetBillingUsage } from '@/hooks/usePlan';
import { useStore } from '@/store';

interface UsageProps {
    selectedMonth: Date;
}

export const Usage: React.FC<UsageProps> = ({ selectedMonth }) => {
    const env = useStore((state) => state.env);
    const { plan } = useEnvironment(env);

    // Calculate timeframe for the selected month
    const timeframe = useMemo(() => {
        const start = new Date(Date.UTC(selectedMonth.getUTCFullYear(), selectedMonth.getUTCMonth(), 1));
        const end = new Date(Date.UTC(selectedMonth.getUTCFullYear(), selectedMonth.getUTCMonth() + 1, 1));
        return {
            start: start.toISOString(),
            end: end.toISOString()
        };
    }, [selectedMonth]);

    const { data: usage, isLoading, error: usageError } = useApiGetBillingUsage(env, timeframe);

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

            <ChartCard data={usage?.data.usage.connections} isLoading={isLoading} timeframe={timeframe} />
            <ChartCard data={usage?.data.usage.proxy} isLoading={isLoading} timeframe={timeframe} />
            <ChartCard data={usage?.data.usage.function_compute_gbms} isLoading={isLoading} timeframe={timeframe} />
            <ChartCard data={usage?.data.usage.function_executions} isLoading={isLoading} timeframe={timeframe} />
            <ChartCard data={usage?.data.usage.function_logs} isLoading={isLoading} timeframe={timeframe} />
            <ChartCard data={usage?.data.usage.records} isLoading={isLoading} timeframe={timeframe} />
            <ChartCard data={usage?.data.usage.webhook_forwards} isLoading={isLoading} timeframe={timeframe} />

            {usage?.data.customer.portalUrl && (
                <StyledLink icon to={usage.data.customer.portalUrl} type="external">
                    View invoice details
                </StyledLink>
            )}
        </div>
    );
};
