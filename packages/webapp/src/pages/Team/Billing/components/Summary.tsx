import { Pencil } from 'lucide-react';
import { useMemo } from 'react';

import { permissions } from '@nangohq/authz';
import { IconButton } from '@nangohq/design-system';

import { usePermissions } from '@/hooks/usePermissions';
import { useApiGetPlans, useCurrentPlan } from '@/hooks/usePlan';
import { useStripePaymentMethods } from '@/hooks/useStripe';
import { useStore } from '@/store';
import { buildSummaryState, showsSummaryStrip } from '../summaryState';
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

    const state = useMemo(() => {
        if (!plan || arePlansPending) {
            return null;
        }
        return buildSummaryState({ plan, plans: plansList?.data, paymentMethod, canManageBilling, now: new Date() });
    }, [plan, plansList, arePlansPending, paymentMethod, canManageBilling]);

    // Legacy, enterprise and free-uncapped accounts get no strip at all — their terms are negotiated
    // per customer or nothing is billable, so every field would be empty or untrue.
    if (plan && !showsSummaryStrip(plan)) {
        return null;
    }

    return (
        <div className="flex flex-col gap-4">
            <h3 className="text-text-strong text-body-medium-medium">Summary</h3>
            <SummaryStrip
                planTitle={state?.planTitle ?? null}
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
