import { Pencil } from 'lucide-react';
import { useMemo } from 'react';

import { permissions } from '@nangohq/authz';
import { IconButton } from '@nangohq/design-system';

import { usePlanOverrideStore } from '@/features/planOverride';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions';
import { useApiGetPlans, useApiGetUpcomingInvoice, useCurrentPlan } from '@/hooks/usePlan';
import { useStripePaymentMethods } from '@/hooks/useStripe';
import { useStore } from '@/store';
import { isOnS26Pricing } from '@/utils/usage';
import { hasMonthlySpend, showsSummaryStrip } from '../planVisibility';
import { buildSummaryState } from '../summaryState';
import { PaymentMethodDialog } from './PaymentMethodDialog';
import { SummaryStrip } from './SummaryStrip';

/** Data for the summary strip. The rules live in `buildSummaryState`, the layout in `SummaryStrip`. */
export const Summary: React.FC = () => {
    const env = useStore((state) => state.env);
    const { can } = usePermissions();
    const canManageBilling = can(permissions.canManageBilling);

    const { data: environmentData } = useCurrentPlan(env);
    const plan = environmentData?.plan;
    // Wait for the plan list to settle before building state: until it does, titles fall back to raw
    // plan codes, and "changes to growth-v2" is not a sentence to show a customer.
    const { data: plansList, isPending: arePlansPending } = useApiGetPlans(env);
    const { data: paymentMethods } = useStripePaymentMethods(env);
    const { data: metaData } = useMeta();
    const onS26Pricing = isOnS26Pricing(plan, metaData?.data.s26Pricing === true);
    const paymentMethod = paymentMethods?.data && paymentMethods.data.length > 0 ? paymentMethods.data[0] : null;

    // Behind a dev-tool flag until the figure is reconciled against real Orb invoices (NAN-6246).
    const spendHeadlineEnabled = usePlanOverrideStore((s) => s.spendHeadlineEnabled);
    const spendEnabled = spendHeadlineEnabled && hasMonthlySpend(plan);
    const { data: upcoming, isPending: isSpendPending, isError: didSpendFail } = useApiGetUpcomingInvoice(env, plan, { enabled: spendEnabled });
    const spend = useMemo(() => {
        if (!spendEnabled) {
            return null;
        }
        // React Query keeps the last successful data when a refetch fails, so the error flag has to
        // clear the amount too, or a failed refresh leaves a stale figure on screen.
        return {
            amountInCents: didSpendFail ? null : (upcoming?.data.amountInCents ?? null),
            currency: didSpendFail ? null : (upcoming?.data.currency ?? null)
        };
    }, [spendEnabled, didSpendFail, upcoming]);

    // Spend decides both the headline and whether the plan gets its own slot, so revealing before it
    // lands means relabelling the card a moment later — worse than a skeleton held a beat longer.
    const isSpendResolving = spendEnabled && isSpendPending && !didSpendFail;

    const state = useMemo(() => {
        if (!plan || arePlansPending || isSpendResolving) {
            return null;
        }
        return buildSummaryState({ plan, plans: plansList?.data, paymentMethod, canManageBilling, spend, onS26Pricing, now: new Date() });
    }, [plan, plansList, arePlansPending, isSpendResolving, paymentMethod, canManageBilling, spend, onS26Pricing]);

    // Legacy, enterprise and free-uncapped accounts get no strip at all — their terms are negotiated
    // per customer or nothing is billable, so every field would be empty or untrue.
    if (plan && !showsSummaryStrip(plan)) {
        return null;
    }

    return (
        <div className="flex flex-col gap-3">
            <h3 className="text-text-strong text-body-medium-medium">Summary</h3>
            <SummaryStrip
                headline={state?.headline ?? null}
                plan={state?.plan}
                date={state?.date}
                payment={
                    state?.payment && {
                        card: state.payment.card,
                        action: (
                            <PaymentMethodDialog replace>
                                <IconButton variant="ghost" size="2xs" label="Edit payment method">
                                    <Pencil className="size-3" />
                                </IconButton>
                            </PaymentMethodDialog>
                        )
                    }
                }
                change={state?.change}
            />
        </div>
    );
};
