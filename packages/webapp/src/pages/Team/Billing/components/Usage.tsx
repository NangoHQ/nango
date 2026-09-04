import { ExternalLink, Info } from 'lucide-react';
import { useMemo } from 'react';

import { Alert, AlertActions, AlertDescription, AlertTitle, Button } from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { usePlanOverrideStore } from '@/features/planOverride';
import { useMeta } from '@/hooks/useMeta';
import { useApiGetBillingPeriodCosts, useApiGetBillingUsage, useApiGetUpcomingInvoice, useCurrentPlan } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import { billedUsageMetrics } from '@/utils/usage';
import { buildMinimumSpendRow } from '../minimumSpend';
import { hasMonthlySpend, hasPlanMinimum, isLegacyPlan } from '../planVisibility';
import { buildUsageRowCharges } from '../usageCharges';
import { useSelectedMonth } from '../useSelectedMonth';
import { FreeUsage } from './FreeUsage';
import { MonthSelector } from './MonthSelector';
import { USAGE_METRIC_LABELS } from './usageMetrics';
import { UsageTable } from './UsageTable';

export const Usage: React.FC = () => {
    const env = useStore((state) => state.env);
    const { selectedMonth, isCurrentMonth } = useSelectedMonth();
    const { data: environmentData } = useCurrentPlan(env);
    const { data: metaData } = useMeta();
    const plan = environmentData?.plan;
    const isFree = plan?.name === 'free';
    const metrics = billedUsageMetrics(plan, metaData?.data.s26Pricing === true);

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

    const metricChargesEnabled = usePlanOverrideStore((s) => s.metricChargesEnabled);
    // Orb only holds costs for the period in progress, so a past month has no charge to state.
    const chargesEnabled = metricChargesEnabled && isCurrentMonth && hasMonthlySpend(plan);
    const { data: periodCosts, isPending: costsPending, isError: costsError } = useApiGetBillingPeriodCosts(env, plan, { enabled: chargesEnabled });
    const charges = buildUsageRowCharges({ enabled: chargesEnabled, isPending: costsPending, isError: costsError, data: periodCosts });

    const minimumEnabled = chargesEnabled && hasPlanMinimum(plan);
    const { data: upcoming, isError: upcomingError } = useApiGetUpcomingInvoice(env, plan, { enabled: minimumEnabled });
    const minimumSpend = buildMinimumSpendRow({
        enabled: minimumEnabled && !upcomingError,
        minimum: upcoming?.data.minimum ?? null,
        currency: upcoming?.data.currency ?? null
    });

    if (usageError) {
        return (
            <div className="w-full flex flex-col gap-6">
                <CriticalErrorAlert message="Error loading usage" />
            </div>
        );
    }

    // Free accounts get the caps view (usage against plan limits, with the same drill-in). Capped
    // metrics live only on the Free plan; paid/legacy keep the current charts-only view below.
    if (isFree) {
        return (
            <div className="w-full flex flex-col gap-4">
                <FreeUsage metrics={metrics} />
            </div>
        );
    }

    const isLegacy = isLegacyPlan(plan);
    // Paid/legacy plans are uncapped (only `freePlan` sets real limits in `plans/definitions.ts`).
    const rows = metrics.map((metric) => ({
        metric,
        label: USAGE_METRIC_LABELS[metric],
        usage: usage?.data.usage[metric]?.total ?? 0,
        limit: null,
        capsLoading: isLoading,
        data: usage?.data.usage[metric]
    }));

    return (
        <div className="w-full flex flex-col gap-4">
            {isLegacy && (
                <Alert variant="info">
                    <Info />
                    <AlertTitle>Legacy plan</AlertTitle>
                    <AlertDescription>
                        Legacy plans have different usage metrics.
                        {usage?.data.customer.portalUrl && ' You can see your usage in your billing portal.'}
                    </AlertDescription>
                    {usage?.data.customer.portalUrl && (
                        <AlertActions>
                            <Button asChild variant="link-accent" size="xs">
                                <a
                                    href={usage.data.customer.portalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => track('web:usage:billing_portal_clicked', {})}
                                >
                                    View billing portal
                                    <ExternalLink />
                                </a>
                            </Button>
                        </AlertActions>
                    )}
                </Alert>
            )}

            <div className="flex justify-between items-center">
                <span className="text-text-strong text-body-medium-medium">Usage</span>
                <MonthSelector />
            </div>

            <UsageTable
                rows={rows}
                isLoading={isLoading}
                env={env}
                timeframe={timeframe}
                chartMode="daily"
                variant={charges ? 'charges' : 'usage'}
                charges={charges}
                minimumSpend={minimumSpend}
            />
        </div>
    );
};
