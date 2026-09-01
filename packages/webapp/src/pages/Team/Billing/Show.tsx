import { ArrowUpRight, ExternalLink } from 'lucide-react';
import { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useLocation } from 'react-router-dom';

import { permissions } from '@nangohq/authz';
import { AlertButton, Button } from '@nangohq/design-system';

import { AlertButtonLink } from '@/components/ui/AlertButtonLink';
import { Separator } from '@/components/ui/Separator';
import { OverdueInvoiceAlert } from '@/features/Billing/OverdueInvoiceAlert';
import { usePlanOverrideStore } from '@/features/planOverride';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions';
import { useApiGetBillingUsage, useApiGetOverdueInvoices, useApiGetPlans, useApiGetUsage, useCurrentPlan } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import { billedUsageMetrics, getAggregateUsageState } from '@/utils/usage';
import DashboardLayout from '../../../layout/DashboardLayout';
import { BillingHeaderAction } from './components/BillingHeaderAction';
import { Payment } from './components/Payment';
import { PaymentMethodDialog } from './components/PaymentMethodDialog';
import { Plans } from './components/Plans';
import { ScheduledPlanChangeAlert } from './components/ScheduledPlanChangeAlert';
import { SpendAlerts } from './components/SpendAlerts';
import { Summary } from './components/Summary';
import { Usage } from './components/Usage';
import { UsageLimitBanner } from './components/UsageLimitBanner';
import { hasMonthlySpend, showsSummaryStrip } from './planVisibility';

export const TeamBilling: React.FC = () => {
    const { can } = usePermissions();
    const canManageBilling = can(permissions.canManageBilling);
    const usageLimitOverride = usePlanOverrideStore((s) => s.usageLimitOverride);

    // Hidden for legacy, enterprise and free-uncapped accounts. Checked here as well as inside
    // `Summary` so the section's separator goes with it. Shown while the plan is still loading, but
    // not once the query has settled without one — otherwise a failed load leaves a stuck skeleton.
    const env = useStore((state) => state.env);
    const { data: environmentData, isPending: isPlanPending, isError: didPlanFail } = useCurrentPlan(env);
    // Plan titles come from `/api/v1/plans`; with no titles the strip can only show raw Orb codes,
    // so a failed load hides the section rather than leaking them or holding a skeleton forever.
    const { isError: didPlanListFail } = useApiGetPlans(env);
    const showSummary = !didPlanListFail && (isPlanPending || showsSummaryStrip(environmentData?.plan));

    // A failed refetch keeps the previous plan cached, so the error is checked rather than trusting stale data.
    const showSpendAlerts = canManageBilling && !didPlanFail && hasMonthlySpend(environmentData?.plan) && !!environmentData?.plan?.orb_subscription_id;

    // The cap warning belongs with the plan, not the usage table, so it sits above the divider.
    // Free is the only capped plan, and the sidebar alert already runs this query app-wide.
    const { data: caps } = useApiGetUsage(env);
    const { data: metaData } = useMeta();
    const billedMetrics = billedUsageMetrics(environmentData?.plan, metaData?.data.s26Pricing === true);

    // The dev override fabricates the overdue response, so it has to be handed a real portal URL for
    // the previewed "View invoices" link to open anything. Fetched only while the override is on, and
    // on the same key as <Payment/>'s unfiltered call, so it never costs a production request.
    const overdueOverride = usePlanOverrideStore((s) => s.overdueOverride);
    const { data: billingUsage } = useApiGetBillingUsage(env, undefined, { enabled: overdueOverride });

    // Owned here rather than by <Usage/> so a usage outage can't hide a payment warning, and so it
    // sits above the cap warning: money owed outranks a limit being approached.
    const { data: overdue } = useApiGetOverdueInvoices(env, environmentData?.plan, billingUsage?.data.customer.portalUrl);
    const overdueBanner = overdue?.data.hasOverdue && (
        <OverdueInvoiceAlert size="wide" canManageBilling={canManageBilling}>
            {overdue.data.portalUrl && (
                <AlertButtonLink
                    to={overdue.data.portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => track('web:usage:invoice_details_clicked', {})}
                >
                    View invoices <ExternalLink />
                </AlertButtonLink>
            )}
            <PaymentMethodDialog replace>
                <AlertButton onClick={() => track('web:usage:edit_payment_method_clicked', { source: 'billing_page' })}>
                    Edit payment method <ArrowUpRight />
                </AlertButton>
            </PaymentMethodDialog>
        </OverdueInvoiceAlert>
    );

    useEffect(() => {
        track('web:usage:viewed', {});
    }, []);

    // The 3 sections used to be separate tabs reachable via #usage/#plans/#payment-and-invoices
    // (still linked from other pages). Now that they're stacked on one page, scroll to the matching
    // section instead of switching tabs.
    const location = useLocation();
    useEffect(() => {
        const hash = location.hash.slice(1);
        if (!hash) {
            return;
        }
        document.getElementById(hash)?.scrollIntoView({ block: 'start' });
    }, [location.hash]);

    // Full-width page shell keeps chrome consistent with the other dashboard pages, but `centered`
    // caps the content: the usage charts have a fixed height, so unbounded width stretches them to an
    // unreadable aspect ratio on wide screens.
    return (
        <DashboardLayout fullWidth centered title="Billing & usage" titleActions={<BillingHeaderAction />}>
            <Helmet>
                <title>Billing & usage - Nango</title>
            </Helmet>
            <div className="flex flex-col gap-8">
                {/* Legacy, enterprise and free-uncapped get no strip, but can still owe an invoice. */}
                <div className="flex flex-col gap-3 empty:hidden">
                    {overdueBanner}
                    {showSummary && <UsageLimitBanner state={usageLimitOverride ?? getAggregateUsageState(caps?.data ?? {}, billedMetrics)} />}
                </div>
                {showSummary && (
                    <>
                        <div id="summary">
                            <Summary />
                        </div>
                        <Separator />
                    </>
                )}
                <div id="usage">
                    <Usage />
                </div>
                {showSpendAlerts && (
                    <>
                        <Separator />
                        <div id="spend-alerts">
                            <SpendAlerts />
                        </div>
                    </>
                )}
                <Separator />
                <div id="plans" className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-text-strong text-body-medium-medium">Plans</span>
                        <Button asChild variant="link-accent">
                            <a href="https://nango.dev/pricing" target="_blank" rel="noopener noreferrer">
                                View full pricing detail
                                <ExternalLink />
                            </a>
                        </Button>
                    </div>
                    {/* Outside the scroll container below, so the full-width alert doesn't scroll with the plan cards. */}
                    <ScheduledPlanChangeAlert />
                    <div className="w-full overflow-x-auto">
                        <Plans />
                    </div>
                </div>
                {canManageBilling && (
                    <>
                        <Separator />
                        <div id="payment-and-invoices">
                            <Payment />
                        </div>
                    </>
                )}
            </div>
        </DashboardLayout>
    );
};
