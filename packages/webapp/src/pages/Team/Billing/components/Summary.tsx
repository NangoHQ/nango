import { Pencil } from 'lucide-react';
import { useMemo } from 'react';

import { permissions } from '@nangohq/authz';
import { IconButton } from '@nangohq/design-system';

import { usePlanOverrideStore } from '@/features/planOverride';
import { usePermissions } from '@/hooks/usePermissions';
import { useApiGetPlans, useApiGetUpcomingInvoice, useCurrentPlan } from '@/hooks/usePlan';
import { useStripePaymentMethods } from '@/hooks/useStripe';
import { useStore } from '@/store';
import { showsSpendHeadline, showsSummaryStrip } from '../planVisibility';
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
    const paymentMethod = paymentMethods?.data && paymentMethods.data.length > 0 ? paymentMethods.data[0] : null;

    // Behind a dev-tool flag until the figure is reconciled against real Orb invoices (NAN-6246).
    // With it off this is `false`, `spend` stays null, and the strip renders exactly as it did
    // before — including making no request.
    const spendHeadlineEnabled = usePlanOverrideStore((s) => s.spendHeadlineEnabled);
    const spendEnabled = spendHeadlineEnabled && canManageBilling && showsSpendHeadline(plan);
    const { data: upcoming, isPending: isSpendPending, isError: didSpendFail } = useApiGetUpcomingInvoice(env, plan, { enabled: spendEnabled });
    const spend = useMemo(() => {
        if (!spendEnabled) {
            return null;
        }
        // `isPending` stays true forever on a disabled or failed query, so pair it with the error
        // flag — otherwise a failed read skeletons the headline instead of falling back.
        return {
            pending: isSpendPending && !didSpendFail,
            amountInCents: upcoming?.data.amountInCents ?? null,
            currency: upcoming?.data.currency ?? null
        };
    }, [spendEnabled, isSpendPending, didSpendFail, upcoming]);

    const state = useMemo(() => {
        if (!plan || arePlansPending) {
            return null;
        }
        return buildSummaryState({ plan, plans: plansList?.data, paymentMethod, canManageBilling, spend, now: new Date() });
    }, [plan, plansList, arePlansPending, paymentMethod, canManageBilling, spend]);

    // Legacy, enterprise and free-uncapped accounts get no strip at all — their terms are negotiated
    // per customer or nothing is billable, so every field would be empty or untrue.
    if (plan && !showsSummaryStrip(plan)) {
        return null;
    }

    return (
        <div className="flex flex-col gap-4">
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
