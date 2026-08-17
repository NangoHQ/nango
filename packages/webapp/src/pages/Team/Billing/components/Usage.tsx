import { ExternalLink, Info } from 'lucide-react';
import { useMemo } from 'react';

import { permissions } from '@nangohq/authz';
import { Alert, AlertButton, AlertDescription, AlertTitle, Button } from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { OverdueInvoiceAlert } from '@/components/patterns/OverdueInvoiceAlert';
import { usePermissions } from '@/hooks/usePermissions';
import { useApiGetBillingUsage, useApiGetOverdueInvoices, useCurrentPlan } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import { isLegacyPlan } from '../planVisibility';
import { useSelectedMonth } from '../useSelectedMonth';
import { FreeUsage } from './FreeUsage';
import { MonthSelector } from './MonthSelector';
import { PaymentMethodDialog } from './PaymentMethodDialog';
import { USAGE_METRIC_LABELS, USAGE_METRICS } from './usageMetrics';
import { UsageTable } from './UsageTable';

export const Usage: React.FC = () => {
    const env = useStore((state) => state.env);
    const { selectedMonth } = useSelectedMonth();
    const { data: environmentData } = useCurrentPlan(env);
    const plan = environmentData?.plan;
    const isFree = plan?.name === 'free';
    const { can } = usePermissions();
    const canManageBilling = can(permissions.canManageBilling);

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
    const { data: overdue } = useApiGetOverdueInvoices(env, plan);

    // Overdue-payment warning. Rendered independently of the usage query so a
    // usage-fetch failure can't hide it — customers can still reach the portal.
    // `replace` because auto-collection means a card was already on file and its charge failed. The
    // action is gated like the payment section below it — without the permission there's nothing the
    // user can do here, so the alert warns without offering a dead end.
    const overdueBanner = overdue?.data.hasOverdue && (
        <OverdueInvoiceAlert size="wide">
            {canManageBilling && (
                <PaymentMethodDialog replace>
                    <AlertButton>Edit payment method</AlertButton>
                </PaymentMethodDialog>
            )}
        </OverdueInvoiceAlert>
    );

    if (usageError) {
        return (
            <div className="w-full flex flex-col gap-6">
                {overdueBanner}
                <CriticalErrorAlert message="Error loading usage" />
            </div>
        );
    }

    // Free accounts get the caps view (usage against plan limits, with the same drill-in). Capped
    // metrics live only on the Free plan; paid/legacy keep the current charts-only view below.
    if (isFree) {
        return <FreeUsage />;
    }

    const isLegacy = isLegacyPlan(plan);
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
            {overdueBanner}

            {isLegacy && (
                <Alert variant="info">
                    <Info />
                    <AlertTitle>You&apos;re on a legacy plan</AlertTitle>
                    <AlertDescription>
                        Legacy plans have different usage metrics.
                        {usage?.data.customer.portalUrl && (
                            <>
                                {' '}
                                You can see your usage in the{' '}
                                <Button asChild variant="link-accent" size="xs">
                                    <a
                                        href={usage?.data.customer.portalUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => track('web:usage:billing_portal_clicked', {})}
                                    >
                                        billing portal
                                        <ExternalLink />
                                    </a>
                                </Button>
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
        </div>
    );
};
