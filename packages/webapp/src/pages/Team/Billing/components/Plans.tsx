import { Info, Loader } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mutate } from 'swr';

import { Dot } from './Dot.js';
import { DialogClose, DialogContent, DialogFooter } from '../../../../components-v2/ui/dialog.jsx';
import { DialogHeader, DialogTitle } from '@/components/ui/Dialog.js';
import { StyledLink } from '@/components-v2/StyledLink.js';
import { Alert, AlertDescription } from '@/components-v2/ui/alert.js';
import { Button, ButtonLink } from '@/components-v2/ui/button';
import { Dialog } from '@/components-v2/ui/dialog.js';
import { Table, TableBody, TableCell, TableRow } from '@/components-v2/ui/table';
import { useEnvironment } from '@/hooks/useEnvironment';
import { apiGetCurrentPlan, apiPostPlanChange, useApiGetPlans } from '@/hooks/usePlan';
import { useToast } from '@/hooks/useToast.js';
import { queryClient, useStore } from '@/store';
import { stripePromise } from '@/utils/stripe.js';

import type { PlanDefinitionList } from '../types.js';
import type { PlanDefinition } from '@nangohq/types';

export const Plans: React.FC = () => {
    const env = useStore((state) => state.env);

    const { plan: currentPlan } = useEnvironment(env);
    const { data: plansList } = useApiGetPlans(env);

    const [selectedPlan, setSelectedPlan] = useState<null | PlanDefinitionList>(null);

    const futurePlan = useMemo(() => {
        if (!currentPlan?.orb_future_plan) {
            return null;
        }

        return plansList?.data.find((p) => p.orbId === currentPlan.orb_future_plan);
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
                isFuture: plan.orbId === currentPlan.orb_future_plan,
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
                        return <PlanRow key={plan.plan.code} planDefinition={plan} onClick={() => setSelectedPlan(plan)} />;
                    })}
                </TableBody>
            </Table>
            <StyledLink to="https://nango.dev/pricing" icon type="external">
                View full pricing
            </StyledLink>

            <PlanDialog activePlan={plans?.activePlan} selectedPlan={selectedPlan} onClose={() => setSelectedPlan(null)} />
        </div>
    );
};

const PlanRow: React.FC<{ planDefinition: PlanDefinitionList; onClick?: () => void }> = ({ planDefinition, onClick }) => {
    const { plan, active, isFuture, isDowngrade, isUpgrade } = planDefinition;

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
                <Button onClick={onClick} variant="primary" className="w-27">
                    Upgrade
                </Button>
            );
        }

        if (isDowngrade && plan.canChange) {
            return (
                <Button onClick={onClick} variant="destructive" className="w-27">
                    Downgrade
                </Button>
            );
        }

        return (
            <ButtonLink variant="secondary" className="w-27" to="https://nango.dev/support" target="_blank">
                Contact us
            </ButtonLink>
        );
    }, [isUpgrade, plan.canChange, isDowngrade, active, isFuture, onClick]);

    return (
        <TableRow>
            <TableCell className="w-1/3">
                <div className="inline-flex items-center gap-1 py-3">
                    {plan.title} {active && <Dot />}
                </div>
            </TableCell>
            <TableCell className="text-left py-3">{plan.basePrice ? `From $${plan.basePrice}/month` : '—'}</TableCell>
            <TableCell className="text-right py-3">{ButtonComponent}</TableCell>
        </TableRow>
    );
};

const PlanDialog: React.FC<{
    activePlan?: PlanDefinition | null;
    selectedPlan?: PlanDefinitionList | null;
    onClose: () => void;
}> = ({ activePlan, selectedPlan, onClose }) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();

    const [loading, setLoading] = useState(false);
    const [longWait, setLongWait] = useState(false);

    const refInterval = useRef<NodeJS.Timeout>();

    const onUpgrade = async () => {
        if (!selectedPlan?.plan.orbId) {
            return;
        }

        setLoading(true);
        setLongWait(false);

        const res = await apiPostPlanChange(env, { orbId: selectedPlan.plan.orbId });
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
            if (res.json.data.name !== selectedPlan.plan.orbId) {
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
            onClose();

            toast({ title: `Upgraded successfully to ${selectedPlan.plan.title}`, variant: 'success' });
        }, 500);
    };

    const onDowngrade = async () => {
        if (!selectedPlan?.plan.orbId) {
            return;
        }

        setLoading(true);
        const res = await apiPostPlanChange(env, { orbId: selectedPlan.plan.orbId });
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
            if (res.json.data.orb_future_plan !== selectedPlan.plan.orbId) {
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
            onClose();

            toast({ title: `Downgraded successfully to ${selectedPlan.plan.title}`, variant: 'success' });
        }, 500);
    };

    useEffect(() => {
        if (!selectedPlan && refInterval.current) {
            clearInterval(refInterval.current);
            setLongWait(false);
        }
    }, [selectedPlan]);

    return (
        <Dialog open={selectedPlan !== null} onOpenChange={(open) => !open && onClose()}>
            {selectedPlan && (
                <DialogContent className="text-text-secondary text-sm">
                    <DialogHeader>
                        <DialogTitle>
                            Confirm {selectedPlan.isUpgrade ? 'upgrade' : 'downgrade'} to {selectedPlan.plan.title} plan
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-1">
                        {selectedPlan.isUpgrade && (
                            <p>
                                The {selectedPlan.plan.title} plan includes a ${selectedPlan.plan.basePrice} monthly base fee, plus additional usage-based
                                charges. When you upgrade, you&apos;ll be charged a prorated base fee for the current month.
                            </p>
                        )}
                        {selectedPlan.isDowngrade && (
                            <p>
                                Your {activePlan?.title ? activePlan.title : 'current'} subscription will end at the end of this month and won’t renew. Any
                                remaining usage will be billed after the month ends.
                            </p>
                        )}
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
            )}
        </Dialog>
    );
};
