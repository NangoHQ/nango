import { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useLocation } from 'react-router-dom';

import { permissions } from '@nangohq/authz';

import { Separator } from '@/components/ui/Separator';
import { usePlanOverrideStore } from '@/features/planOverride';
import { usePermissions } from '@/hooks/usePermissions';
import { useApiGetPlans, useApiGetUsage, useCurrentPlan } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import { getAggregateUsageState } from '@/utils/usage';
import DashboardLayout from '../../../layout/DashboardLayout';
import { BillingHeaderAction } from './components/BillingHeaderAction';
import { Payment } from './components/Payment';
import { Plans } from './components/Plans';
import { ScheduledPlanChangeAlert } from './components/ScheduledPlanChangeAlert';
import { Summary } from './components/Summary';
import { Usage } from './components/Usage';
import { UsageLimitBanner } from './components/UsageLimitBanner';
import { showsSummaryStrip } from './planVisibility';

export const TeamBilling: React.FC = () => {
    const { can } = usePermissions();
    const canManageBilling = can(permissions.canManageBilling);
    const usageLimitOverride = usePlanOverrideStore((s) => s.usageLimitOverride);

    // Hidden for legacy, enterprise and free-uncapped accounts. Checked here as well as inside
    // `Summary` so the section's separator goes with it. Shown while the plan is still loading, but
    // not once the query has settled without one — otherwise a failed load leaves a stuck skeleton.
    const env = useStore((state) => state.env);
    const { data: environmentData, isPending: isPlanPending } = useCurrentPlan(env);
    // Plan titles come from `/api/v1/plans`; with no titles the strip can only show raw Orb codes,
    // so a failed load hides the section rather than leaking them or holding a skeleton forever.
    const { isError: didPlanListFail } = useApiGetPlans(env);
    const showSummary = !didPlanListFail && (isPlanPending || showsSummaryStrip(environmentData?.plan));

    // The cap warning belongs with the plan, not the usage table, so it sits above the divider.
    // Free is the only capped plan, and the sidebar alert already runs this query app-wide.
    const { data: caps } = useApiGetUsage(env);

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
                {showSummary && (
                    <>
                        <div id="summary" className="flex flex-col gap-3">
                            <Summary />
                            <UsageLimitBanner state={usageLimitOverride ?? getAggregateUsageState(caps?.data ?? {})} />
                        </div>
                        <Separator />
                    </>
                )}
                <div id="usage">
                    <Usage />
                </div>
                <Separator />
                <div id="plans" className="flex flex-col gap-4">
                    <span className="text-text-strong text-body-medium-medium">Plans</span>
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
