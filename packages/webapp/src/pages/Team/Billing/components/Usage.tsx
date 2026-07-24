import { Info } from 'lucide-react';
import { useMemo } from 'react';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { StyledLink } from '@/components/ui/StyledLink';
import { useApiGetBillingUsage, useCurrentPlan } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import { useSelectedMonth } from '../useSelectedMonth';
import { FreeUsage } from './FreeUsage';
import { MonthSelector } from './MonthSelector';
import { USAGE_METRIC_LABELS, USAGE_METRICS } from './usageMetrics';
import { UsageTable } from './UsageTable';

import type { DBPlan } from '@nangohq/types';

// Plans on the current usage model. Any plan not listed here is treated as a legacy plan (different usage metrics).
// Typed against `DBPlan['name']` so a renamed or removed plan fails to compile instead of silently drifting.
const CURRENT_PLAN_NAMES: readonly DBPlan['name'][] = ['free', 'free-uncapped', 'startup-deal', 'enterprise-cloud-hosted', 'starter-v2', 'growth-v2'];

export const Usage: React.FC = () => {
    const env = useStore((state) => state.env);
    const { selectedMonth } = useSelectedMonth();
    const { data: environmentData } = useCurrentPlan(env);
    const plan = environmentData?.plan;
    const isFree = plan?.name === 'free';

    // Calculate timeframe for the selected month
    const timeframe = useMemo(() => {
        const start = new Date(Date.UTC(selectedMonth.getUTCFullYear(), selectedMonth.getUTCMonth(), 1));
        const end = new Date(Date.UTC(selectedMonth.getUTCFullYear(), selectedMonth.getUTCMonth() + 1, 1));
        return {
            start: start.toISOString(),
            end: end.toISOString()
        };
    }, [selectedMonth]);

    // Free renders <FreeUsage/> (which fetches its own ClickHouse data), so skip this query for
    // Free — it would double-fetch. Gate on `plan` being resolved too: until it loads `isFree` is
    // false, so a bare `!isFree` would fire one request (and can briefly hit Orb) before we know
    // the plan. Paid accounts have `plan` cached from the app shell, so this adds no real delay.
    // avgPerDay: connections/records come back as the concurrent daily count rather than the
    // billing running-average, matching what each row's drill-in chart also requests.
    const { data: usage, isLoading, error: usageError } = useApiGetBillingUsage(env, timeframe, { avgPerDay: true, enabled: plan != null && !isFree });

    if (usageError) {
        return <CriticalErrorAlert message="Error loading usage" />;
    }

    // Free accounts get the caps view (usage against plan limits, with the same drill-in). Capped
    // metrics live only on the Free plan; paid/legacy keep the current charts-only view below.
    if (isFree) {
        return <FreeUsage />;
    }

    const isLegacyPlan = plan && !CURRENT_PLAN_NAMES.includes(plan.name);
    // Paid/legacy plans are uncapped (only `freePlan` sets real limits in `plans/definitions.ts`),
    // so every row shows just its usage total — `UsageRow` already renders that gracefully for a
    // `null` limit (no bar, "—" instead of a percent).
    const rows = USAGE_METRICS.map((metric) => ({
        metric,
        label: USAGE_METRIC_LABELS[metric],
        usage: usage?.data.usage[metric]?.total ?? 0,
        limit: null,
        capsLoading: isLoading,
        data: usage?.data.usage[metric]
    }));

    return (
        <div className="w-full flex flex-col gap-4">
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
                                <StyledLink
                                    icon
                                    to={usage?.data.customer.portalUrl}
                                    type="external"
                                    variant="info"
                                    onClick={() => track('web:usage:billing_portal_clicked', {})}
                                >
                                    billing portal
                                </StyledLink>
                            </>
                        )}
                    </AlertDescription>
                </Alert>
            )}

            <div className="flex justify-between items-center">
                <span className="text-text-strong text-body-medium-medium">Usage</span>
                <MonthSelector />
            </div>

            <UsageTable rows={rows} isLoading={isLoading} env={env} timeframe={timeframe} chartMode="daily" showLimits={false} />

            {usage?.data.customer.portalUrl && (
                <StyledLink icon to={usage.data.customer.portalUrl} type="external" onClick={() => track('web:usage:invoice_details_clicked', {})}>
                    View invoice details
                </StyledLink>
            )}
        </div>
    );
};
