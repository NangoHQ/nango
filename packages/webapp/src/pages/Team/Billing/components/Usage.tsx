import { useMemo } from 'react';

import { ChartCard } from '@/components-v2/ChartCard';
import { CriticalErrorAlert } from '@/components-v2/CriticalErrorAlert';
import { StyledLink } from '@/components-v2/StyledLink';
import { useApiGetBillingUsage } from '@/hooks/usePlan';
import { useStore } from '@/store';

interface UsageProps {
    selectedMonth: Date;
}

export const Usage: React.FC<UsageProps> = ({ selectedMonth }) => {
    const env = useStore((state) => state.env);

    // Calculate timeframe for the selected month
    const timeframe = useMemo(() => {
        const start = new Date(selectedMonth.getUTCFullYear(), selectedMonth.getUTCMonth(), 1);
        const end = new Date(selectedMonth.getUTCFullYear(), selectedMonth.getUTCMonth() + 1, 0, 23, 59, 59, 999);
        return {
            start: start.toISOString(),
            end: end.toISOString()
        };
    }, [selectedMonth]);

    const { data: usage, error: usageError } = useApiGetBillingUsage(env, timeframe);

    if (usageError) {
        return <CriticalErrorAlert message="Error loading usage" />;
    }
    return (
        <div className="w-full flex flex-col gap-6">
            {Object.entries(usage?.data.usage ?? {}).map(([metric, usage]) => (
                <ChartCard key={metric} billingUsageMetric={usage} timeframe={timeframe} />
            ))}
            {usage?.data.customer.portalUrl && (
                <StyledLink icon to={usage.data.customer.portalUrl} type="external">
                    View usage details
                </StyledLink>
            )}
        </div>
    );
};
