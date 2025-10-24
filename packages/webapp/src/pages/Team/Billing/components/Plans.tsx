import { Info, Loader } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mutate } from 'swr';

import { Dot } from './Dot.js';
import { PaymentMethodDialog } from './PaymentMethodDialog.js';
import { DialogClose, DialogContent, DialogDescription, DialogFooter } from '../../../../components-v2/ui/dialog.jsx';
import { getLatestVersionInDefinition } from '../types.js';
import { DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog.js';
import { StyledLink } from '@/components-v2/StyledLink.js';
import { Alert, AlertDescription } from '@/components-v2/ui/alert.js';
import { Button, ButtonLink } from '@/components-v2/ui/button';
import { Dialog } from '@/components-v2/ui/dialog.js';
import { Table, TableBody, TableCell, TableRow } from '@/components-v2/ui/table';
import { useEnvironment } from '@/hooks/useEnvironment';
import { apiGetCurrentPlan, apiPostPlanChange, useApiGetPlans } from '@/hooks/usePlan';
import { useStripePaymentMethods } from '@/hooks/useStripe.js';
import { useToast } from '@/hooks/useToast.js';
import { queryClient, useStore } from '@/store';
import { stripePromise } from '@/utils/stripe.js';

import type { PlanDefinitionList } from '../types.js';
import type { PlanDefinition, StripePaymentMethod } from '@nangohq/types';

export const Plans: React.FC = () => {
    const env = useStore((state) => state.env);

    const { plan: currentPlan } = useEnvironment(env);
    const { data: plansList } = useApiGetPlans(env);
    const { data: paymentMethods } = useStripePaymentMethods(env);

    const paymentMethod = useMemo(() => {
        return paymentMethods?.data && paymentMethods.data.length > 0 ? paymentMethods.data[0] : null;
    }, [paymentMethods]);

    const futurePlan = useMemo(() => {
        if (!currentPlan?.orb_future_plan) {
            return null;
        }

        return plansList?.data.find((p) => p.name === currentPlan.orb_future_plan);
    }, [currentPlan, plansList]);

    const plans = useMemo<null | { list: PlanDefinitionList[]; activePlan: PlanDefinition }>(() => {
        if (!currentPlan || !plansList) {
            return null;
        }

        const curr = plansList.data.find((p) => p.name === currentPlan.name)!;

        const list: PlanDefinitionList[] = [];
        for (const plan of plansList.data) {
            if (plan.hidden) {
                continue;
            }
            const same = plan.name === currentPlan.name;

            list.push({
                plan,
                active: same,
                isFuture: plan.name === currentPlan.orb_future_plan,
                isDowngrade: curr.prevPlan?.includes(plan) || false,
                isUpgrade: curr.nextPlan?.includes(plan) || false
            });
        }
        return { list, activePlan: curr };
    }, [currentPlan, plansList]);

    const futurePlanMessage = useMemo(() => {
        if (!futurePlan) {
            return null;
        }

        if (futurePlan.isPaid) {
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
                        return <PlanRow key={plan.plan.name} planDefinition={plan} activePlan={plans?.activePlan} paymentMethod={paymentMethod} />;
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
                    <Button onClick={onUpgradeClicked} variant="primary" className="w-27">
                        Upgrade
                    </Button>
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
                <PlanChangeDialog selectedPlan={planDefinition} activePlan={activePlan}>
                    <Button variant="destructive" className="w-27">
                        Downgrade
                    </Button>
                </PlanChangeDialog>
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
                <div className="inline-flex items-center gap-1 py-3">
                    {plan.title} {active && <Dot />}
                </div>
            </TableCell>
            <TableCell className="text-left py-3 text-text-secondary">{plan.basePrice ? `From $${plan.basePrice}/month` : '—'}</TableCell>
            <TableCell className="text-right py-3 text-text-secondary">{ButtonComponent}</TableCell>
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
            onOpenChange?.(value);
        },
        [isControlled, onOpenChange]
    );

    const [loading, setLoading] = useState(false);
    const [longWait, setLongWait] = useState(false);

    const refInterval = useRef<NodeJS.Timeout>();

    const onUpgrade = async () => {
        if (!selectedPlan?.plan.name) {
            return;
        }

        setLoading(true);
        setLongWait(false);

        const res = await apiPostPlanChange(env, { name: selectedPlan.plan.name, version: getLatestVersionInDefinition(selectedPlan.plan) });
        if ('error' in res.json) {
            setLoading(false);
            toast({ title: 'Failed to upgrade, an error occurred', variant: 'error' });
            return;
        }

        if ('paymentIntent' in res.json.data) {
            res.json.data.paymentIntent;
            const stripe = await stripePromise;
            const result = await stripe!.confirmCardPayment(res.json.data.paymentIntent.client_secret);

            if (result.error) {
                console.error({ error: result.error });
                toast({ title: 'An error occurred while validating your payment', variant: 'error' });
                return;
            } else if (result.paymentIntent.status === 'succeeded') {
                console.log('payment success', result);
            }
        }

        refInterval.current = setInterval(async () => {
            const res = await apiGetCurrentPlan(env);
            if ('error' in res.json) {
                return;
            }
            if (res.json.data.name !== selectedPlan.plan.name) {
                setLongWait(true);
                return;
            }

            clearInterval(refInterval.current);

            await Promise.all([
                queryClient.invalidateQueries({ exact: false, queryKey: ['plans'], type: 'all' }),
                queryClient.refetchQueries({ exact: false, queryKey: ['plans'], type: 'all' }),
                mutate((key) => typeof key === 'string' && key.startsWith(`/api/v1/environments`))
            ]);

            setLongWait(false);
            setLoading(false);

            toast({ title: `Upgraded successfully to ${selectedPlan.plan.title}`, variant: 'success' });
        }, 500);
    };

    const onDowngrade = async () => {
        if (!selectedPlan?.plan.name) {
            return;
        }

        setLoading(true);
        const res = await apiPostPlanChange(env, { name: selectedPlan.plan.name, version: getLatestVersionInDefinition(selectedPlan.plan) });
        if ('error' in res.json) {
            setLoading(false);
            toast({ title: 'Failed to downgrade, an error occurred', variant: 'error' });
            return;
        }

        refInterval.current = setInterval(async () => {
            const res = await apiGetCurrentPlan(env);
            if ('error' in res.json) {
                return;
            }
            if (res.json.data.orb_future_plan !== selectedPlan.plan.name) {
                setLongWait(true);
                return;
            }

            clearInterval(refInterval.current);

            await Promise.all([
                queryClient.invalidateQueries({ exact: false, queryKey: ['plans'], type: 'all' }),
                queryClient.refetchQueries({ exact: false, queryKey: ['plans'], type: 'all' }),
                mutate((key) => typeof key === 'string' && key.startsWith(`/api/v1/environments`))
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
