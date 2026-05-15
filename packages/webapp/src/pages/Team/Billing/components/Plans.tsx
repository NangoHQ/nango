import { Info, Loader } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { permissions } from '@nangohq/authz';

import { PaymentMethodDialog } from './PaymentMethodDialog.js';
import { Dot } from '../../../../components-v2/Dot.js';
import { DialogClose, DialogContent, DialogDescription, DialogFooter } from '../../../../components-v2/ui/dialog.jsx';
import { DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog.js';
import { PermissionGate } from '@/components-v2/PermissionGate.js';
import { StyledLink } from '@/components-v2/StyledLink.js';
import { Alert, AlertDescription } from '@/components-v2/ui/alert.js';
import { Button, ButtonLink } from '@/components-v2/ui/button';
import { Dialog } from '@/components-v2/ui/dialog.js';
import { Table, TableBody, TableCell, TableRow } from '@/components-v2/ui/table';
import { environmentQueryKey, useEnvironment } from '@/hooks/useEnvironment';
import { usePermissions } from '@/hooks/usePermissions.js';
import { fetchCurrentPlan, useApiGetPlans, useApiPostPlanChange } from '@/hooks/usePlan';
import { useStripePaymentMethods } from '@/hooks/useStripe.js';
import { useToast } from '@/hooks/useToast.js';
import { queryClient, useStore } from '@/store';
import { stripePromise } from '@/utils/stripe.js';

import type { PlanDefinitionList } from '../types.js';
import type { StripeError } from '@/utils/stripe.js';
import type { PlanDefinition, StripePaymentMethod } from '@nangohq/types';

export const Plans: React.FC = () => {
    const env = useStore((state) => state.env);

    const { data: environmentData } = useEnvironment(env);
    const currentPlan = environmentData?.plan;
    const { data: plansList } = useApiGetPlans(env);
    const { data: paymentMethods } = useStripePaymentMethods(env);

    const paymentMethod = useMemo(() => {
        return paymentMethods?.data && paymentMethods.data.length > 0 ? paymentMethods.data[0] : null;
    }, [paymentMethods]);

    const futurePlan = useMemo(() => {
        if (!currentPlan?.orb_future_plan) {
            return null;
        }

        return plansList?.data.find((p) => p.code === currentPlan.orb_future_plan);
    }, [currentPlan, plansList]);

    const plans = useMemo<null | { list: PlanDefinitionList[]; activePlan: PlanDefinition }>(() => {
        if (!currentPlan || !plansList) {
            return null;
        }

        const curr = plansList.data.find((p) => p.code === currentPlan.name)!;

        const list: PlanDefinitionList[] = [];
        for (const plan of plansList.data) {
            if (plan.hidden) {
                continue;
            }
            const same = plan.code === currentPlan.name;

            list.push({
                plan,
                active: same,
                isFuture: plan.code === currentPlan.orb_future_plan,
                isDowngrade: curr.prevPlan?.includes(plan.code) || false,
                isUpgrade: curr.nextPlan?.includes(plan.code) || false
            });
        }
        return { list, activePlan: curr };
    }, [currentPlan, plansList]);

    const futurePlanMessage = useMemo(() => {
        if (!futurePlan) {
            return null;
        }

        if (futurePlan?.code !== 'free') {
            return `Your ${plans?.activePlan.title} subscription will switch to Starter at the end of the month.`;
        }

        return `Your ${plans?.activePlan.title} subscription has been cancelled and will terminate at the end of the month.`;
    }, [futurePlan, plans?.activePlan.title]);

    return (
        <div className="flex flex-col gap-8">
            {futurePlanMessage && (
                <Alert variant="info">
                    <Info />
                    <AlertDescription>{futurePlanMessage}</AlertDescription>
                </Alert>
            )}
            <Table>
                <TableBody>
                    {plans?.activePlan.hidden && (
                        <PlanRow
                            planDefinition={{
                                plan: plans?.activePlan,
                                active: true,
                                isDowngrade: false,
                                isUpgrade: false
                            }}
                        />
                    )}
                    {plans?.list.map((plan) => {
                        return <PlanRow key={plan.plan.code} planDefinition={plan} activePlan={plans?.activePlan} paymentMethod={paymentMethod} />;
                    })}
                </TableBody>
            </Table>
            <StyledLink to="https://nango.dev/pricing" icon type="external">
                View full pricing
            </StyledLink>
        </div>
    );
};

const PlanRow: React.FC<{ planDefinition: PlanDefinitionList; activePlan?: PlanDefinition; paymentMethod?: StripePaymentMethod | null }> = ({
    planDefinition,
    activePlan,
    paymentMethod
}) => {
    const { plan, active, isFuture, isDowngrade, isUpgrade } = planDefinition;

    const { can } = usePermissions();
    const canChangePlan = can(permissions.canChangePlan);

    const [paymentMethodDialogOpen, setPaymentMethodDialogOpen] = useState(false);
    const [planChangeDialogOpen, setPlanChangeDialogOpen] = useState(false);

    const onUpgradeClicked = useCallback(() => {
        if (!paymentMethod) {
            setPaymentMethodDialogOpen(true);
        } else {
            setPlanChangeDialogOpen(true);
        }
    }, [paymentMethod]);

    const ButtonComponent = useMemo(() => {
        if (active) {
            return (
                <Button disabled variant="secondary" className="w-27">
                    Current plan
                </Button>
            );
        }
        if (isFuture) {
            return (
                <Button disabled variant="secondary" className="w-27">
                    Scheduled
                </Button>
            );
        }

        if (isUpgrade && plan.canChange) {
            return (
                <>
                    <PermissionGate asChild condition={canChangePlan}>
                        {(allowed) => (
                            <Button onClick={onUpgradeClicked} variant="primary" className="w-27" disabled={!allowed}>
                                Upgrade
                            </Button>
                        )}
                    </PermissionGate>
                    <PaymentMethodDialog
                        open={paymentMethodDialogOpen}
                        onOpenChange={setPaymentMethodDialogOpen}
                        onSuccess={() => setPlanChangeDialogOpen(true)}
                    />
                    <PlanChangeDialog
                        open={planChangeDialogOpen}
                        onOpenChange={setPlanChangeDialogOpen}
                        selectedPlan={planDefinition}
                        activePlan={activePlan}
                    />
                </>
            );
        }

        if (isDowngrade && plan.canChange) {
            return (
                <>
                    <PermissionGate asChild condition={canChangePlan}>
                        {(allowed) => (
                            <Button onClick={() => setPlanChangeDialogOpen(true)} variant="destructive" className="w-27" disabled={!allowed}>
                                Downgrade
                            </Button>
                        )}
                    </PermissionGate>
                    <PlanChangeDialog
                        open={planChangeDialogOpen}
                        onOpenChange={setPlanChangeDialogOpen}
                        selectedPlan={planDefinition}
                        activePlan={activePlan}
                    />
                </>
            );
        }

        return (
            <ButtonLink variant="secondary" className="w-27" to="https://nango.dev/support" target="_blank">
                Contact us
            </ButtonLink>
        );
    }, [active, isFuture, isUpgrade, plan.canChange, isDowngrade, onUpgradeClicked, paymentMethodDialogOpen, planChangeDialogOpen, planDefinition, activePlan]);

    return (
        <TableRow>
            <TableCell className="w-1/3 font-medium">
                <div className="inline-flex items-center gap-1 py-3 text-text-primary text-body-medium-medium">
                    {plan.title} {active && <Dot />}
                </div>
            </TableCell>
            <TableCell className="text-left py-3 text-text-secondary !text-body-medium-regular">
                {plan.basePrice ? `From $${plan.basePrice}/month` : '—'}
            </TableCell>
            <TableCell className="text-right py-3">{ButtonComponent}</TableCell>
        </TableRow>
    );
};

const PlanChangeDialog: React.FC<{
    activePlan?: PlanDefinition | null;
    selectedPlan: PlanDefinitionList;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
}> = ({ activePlan, selectedPlan, open: openProp, onOpenChange, children }) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();

    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = openProp !== undefined;
    const open = isControlled ? openProp : internalOpen;
    const setOpen = useCallback(
        (value: boolean) => {
            if (!isControlled) {
                setInternalOpen(value);
            }
            if (!value) {
                setError(null);
            }
            onOpenChange?.(value);
        },
        [isControlled, onOpenChange]
    );

    const { mutateAsync: postPlanChange } = useApiPostPlanChange(env);

    const [loading, setLoading] = useState(false);
    const [longWait, setLongWait] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refInterval = useRef<NodeJS.Timeout>();

    /**
     * Extracts a `card_error` from the Stripe error or fallback to `defaultError`.
     *
     * @param error - The `StripeError` object returned from `confirmCardPayment`
     * @param defaultError - Fallback message when the error type is not user-actionable
     * @returns `card_error` message if present, otherwise the `defaultError`
     */
    const getStripeCardErrorOrDefault = (error: StripeError, defaultError: string = 'An error occurred while validating your payment.') => {
        switch (error.type) {
            case 'card_error':
                return error.message ?? defaultError;
            default:
                return defaultError;
        }
    };

    const onUpgrade = async () => {
        if (!selectedPlan?.plan.code) {
            return;
        }

        setLoading(true);
        setLongWait(false);
        setError(null);

        let json: Awaited<ReturnType<typeof postPlanChange>>;
        try {
            json = await postPlanChange({ orbId: selectedPlan.plan.code });
        } catch {
            setLoading(false);
            setError('An error occurred. Please try again.');
            return;
        }

        if ('paymentIntent' in json.data) {
            const stripe = await stripePromise;
            if (!stripe) {
                setLoading(false);
                setError('Payment processor failed to load. Please refresh the page and try again.');
                return;
            }

            const result = await stripe.confirmCardPayment(json.data.paymentIntent.client_secret);
            if (result.error) {
                setLoading(false);
                setError(getStripeCardErrorOrDefault(result.error));
                return;
            } else if (result.paymentIntent.status === 'succeeded') {
                console.log('payment success', result);
            }
        }

        refInterval.current = setInterval(async () => {
            const json = await fetchCurrentPlan(env).catch(() => null);
            if (!json) {
                return;
            }
            if (json.data.name !== selectedPlan.plan.code) {
                setLongWait(true);
                return;
            }

            clearInterval(refInterval.current);

            await Promise.all([
                queryClient.invalidateQueries({ exact: false, queryKey: ['plans'], type: 'all' }),
                queryClient.invalidateQueries({ queryKey: environmentQueryKey(env) })
            ]);

            setLongWait(false);
            setLoading(false);

            toast({ title: `Upgraded successfully to ${selectedPlan.plan.title}`, variant: 'success' });
        }, 500);
    };

    const onDowngrade = async () => {
        if (!selectedPlan?.plan.code) {
            return;
        }

        setLoading(true);
        setError(null);

        try {
            await postPlanChange({ orbId: selectedPlan.plan.code });
        } catch {
            setLoading(false);
            setError('An error occurred. Please try again.');
            return;
        }

        refInterval.current = setInterval(async () => {
            const json = await fetchCurrentPlan(env).catch(() => null);
            if (!json) {
                return;
            }
            if (json.data.orb_future_plan !== selectedPlan.plan.code) {
                setLongWait(true);
                return;
            }

            clearInterval(refInterval.current);

            await Promise.all([
                queryClient.invalidateQueries({ exact: false, queryKey: ['plans'], type: 'all' }),
                queryClient.invalidateQueries({ queryKey: environmentQueryKey(env) })
            ]);

            setLongWait(false);
            setLoading(false);

            toast({ title: `Downgraded successfully to ${selectedPlan.plan.title}`, variant: 'success' });
        }, 500);
    };

    useEffect(() => {
        if (!selectedPlan && refInterval.current) {
            clearInterval(refInterval.current);
            setLongWait(false);
        }

        return () => {
            if (refInterval.current) {
                clearInterval(refInterval.current);
            }
        };
    }, [selectedPlan]);

    const description = useMemo(() => {
        if (selectedPlan.isUpgrade) {
            return `The ${selectedPlan.plan.title} plan includes a ${selectedPlan.plan.basePrice} monthly base fee, plus additional usage-based charges. When you upgrade, you'll be charged a prorated base fee for the current month.`;
        }
        return `Your ${activePlan?.title ? activePlan.title : 'current'} subscription will end at the end of this month and won't renew. Any remaining usage will be billed after the month ends.`;
    }, [selectedPlan, activePlan]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {children && <DialogTrigger asChild>{children}</DialogTrigger>}
            <DialogContent className="text-text-secondary text-sm">
                <DialogHeader>
                    <DialogTitle>
                        Confirm {selectedPlan.isUpgrade ? 'upgrade' : 'downgrade'} to {selectedPlan.plan.title} plan
                    </DialogTitle>
                    <DialogDescription className="sr-only">{description}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-1">
                    <p>{description}</p>
                    {longWait && (
                        <p className="text-s text-text-tertiary text-right">{selectedPlan.isUpgrade ? 'Payment is processing...' : 'Downgrading...'}</p>
                    )}
                </div>
                {error && (
                    <Alert variant="error">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="secondary">Cancel</Button>
                    </DialogClose>
                    <Button variant="primary" onClick={selectedPlan.isUpgrade ? onUpgrade : onDowngrade} disabled={loading}>
                        {loading && <Loader className="size-4 animate-spin" />}
                        {selectedPlan.isUpgrade ? 'Upgrade' : 'Downgrade'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
