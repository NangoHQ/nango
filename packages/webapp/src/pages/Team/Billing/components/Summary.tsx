import { Pencil, Plus } from 'lucide-react';
import { useMemo } from 'react';

import { permissions } from '@nangohq/authz';
import { Card, IconButton } from '@nangohq/design-system';

import { Skeleton } from '@/components/ui/Skeleton';
import { usePermissions } from '@/hooks/usePermissions';
import { useApiGetPlans, useCurrentPlan } from '@/hooks/usePlan';
import { useStripePaymentMethods } from '@/hooks/useStripe';
import { useStore } from '@/store';
import { formatBillingDate, nextUsageResetDate } from '../billingPeriod';
import { isLegacyPlan } from '../legacyPlans';
import { PaymentMethodDialog } from './PaymentMethodDialog';

const SummaryItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex flex-col gap-1">
        <span className="type-text-regular-xs text-text-disabled">{label}</span>
        <div className="flex items-center gap-1.5 h-5 type-text-regular-sm text-text-default">{children}</div>
    </div>
);

/**
 * At-a-glance billing summary: current plan, when usage resets, and the card on file. On paid plans
 * the design leads with a current-period spend figure and demotes the plan into the right-hand group —
 * that figure needs an Orb spend read our backend doesn't have yet, so it lands with NAN-6246 and
 * takes over this headline slot then.
 */
export const Summary: React.FC = () => {
    const env = useStore((state) => state.env);
    const { can } = usePermissions();
    const canManageBilling = can(permissions.canManageBilling);

    const { data: environmentData } = useCurrentPlan(env);
    const plan = environmentData?.plan;
    const { data: plansList, isError: plansListError } = useApiGetPlans(env);

    // Hidden/legacy codes are in the list too (`getPlans` doesn't filter), so they resolve to a real
    // title. Falling back to the raw code keeps the strip filled if the list fails to load.
    const planTitle = useMemo(() => {
        if (!plan) {
            return null;
        }
        if (!plansList) {
            return plansListError ? plan.name : null;
        }
        return plansList.data.find((p) => p.code === plan.name)?.title ?? plan.name;
    }, [plan, plansList, plansListError]);

    // Usage is metered over the UTC calendar month on every current plan — Free's caps and the paid
    // plans' monthly tiered pricing alike (`getCurrentMonthBillingMetrics`), so the reset is the 1st.
    // Legacy plans are excluded: their terms are negotiated per customer (several are annual), so no
    // single date here would be true for them.
    const isLegacy = isLegacyPlan(plan);
    const resetsAt = useMemo(() => nextUsageResetDate(new Date()), []);

    const { data: paymentMethods, isLoading: isPaymentMethodsLoading, error: paymentMethodsError } = useStripePaymentMethods(env);
    const paymentMethod = paymentMethods?.data && paymentMethods.data.length > 0 ? paymentMethods.data[0] : null;

    return (
        <div className="flex flex-col gap-4">
            <h3 className="text-text-strong text-body-medium-medium">Summary</h3>
            <Card>
                <div className="p-4 flex items-start justify-between gap-8">
                    <div className="flex flex-col gap-1">
                        <span className="type-text-regular-xs text-text-disabled">CURRENT PLAN</span>
                        <span className="type-heading-lg text-text-strong">{planTitle ?? <Skeleton className="w-24 h-7" />}</span>
                    </div>
                    {/* 62px is the gap between the items in the design, off the spacing scale. */}
                    <div className="flex items-start justify-end gap-[62px]">
                        {/* Skeleton until the plan resolves — whether this item renders at all depends on it. */}
                        {!plan ? (
                            <SummaryItem label="RESETS">
                                <Skeleton className="w-24" />
                            </SummaryItem>
                        ) : (
                            !isLegacy && <SummaryItem label="RESETS">{formatBillingDate(resetsAt)}</SummaryItem>
                        )}
                        {canManageBilling && (
                            <SummaryItem label="PAYMENT METHOD">
                                {isPaymentMethodsLoading ? (
                                    <Skeleton className="w-24" />
                                ) : paymentMethodsError ? (
                                    <span>—</span>
                                ) : paymentMethod ? (
                                    <>
                                        <span className="capitalize">
                                            {paymentMethod.brand ?? 'Card'}···{paymentMethod.last4}
                                        </span>
                                        <PaymentMethodDialog replace>
                                            <IconButton variant="ghost" size="2xs" label="Edit payment method">
                                                <Pencil className="size-3" />
                                            </IconButton>
                                        </PaymentMethodDialog>
                                    </>
                                ) : (
                                    <>
                                        <span>—</span>
                                        <PaymentMethodDialog>
                                            <IconButton variant="ghost" size="2xs" label="Add payment method">
                                                <Plus className="size-3" />
                                            </IconButton>
                                        </PaymentMethodDialog>
                                    </>
                                )}
                            </SummaryItem>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
};
