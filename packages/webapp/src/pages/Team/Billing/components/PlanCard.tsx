import { IconCheck } from '@tabler/icons-react';
import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';

import { StripeForm } from './PaymentMethod';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '../../../../components/ui/Dialog';
import { apiGetCurrentPlan, apiPostPlanChange } from '../../../../hooks/usePlan';
import { useToast } from '../../../../hooks/useToast';
import { queryClient, useStore } from '../../../../store';
import { stripePromise } from '../../../../utils/stripe';
import { cn } from '../../../../utils/utils';
import { Button } from '@/components-v2/ui/button';

import type { PlanDefinitionList } from '../types';
import type { GetEnvironment, PlanDefinition } from '@nangohq/types';

export const PlanCard: React.FC<{
    def: PlanDefinitionList;
    hasPaymentMethod: boolean;
    activePlan: PlanDefinition;
    currentPlan: GetEnvironment['Success']['plan'];
}> = ({ def, hasPaymentMethod, activePlan, currentPlan }) => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const [open, setOpen] = useState(false);
    const [, setLoading] = useState(false);
    const [longWait, setLongWait] = useState(false);
    const refInterval = useRef<NodeJS.Timeout>();

    const onClick = () => {
        if (!def.plan.canChange) {
            window.open('https://www.nango.dev/demo', '_blank');
            return;
        }

        setOpen(true);
    };

    const onUpgrade = async () => {
        if (!def.plan.orbId) {
            return;
        }

        setLoading(true);
        setLongWait(false);
        const res = await apiPostPlanChange(env, { orbId: def.plan.orbId });
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
            if (res.json.data.name !== def.plan.orbId) {
                setLongWait(true);
                return;
            }

            clearInterval(refInterval.current);

            await Promise.all([
                queryClient.invalidateQueries({ exact: false, queryKey: ['plans'], type: 'all' }),
                queryClient.refetchQueries({ exact: false, queryKey: ['plans'], type: 'all' }),
                mutate((key) => typeof key === 'string' && key.startsWith(`/api/v1/environments`))
            ]);

            setLoading(false);
            setOpen(false);

            toast({ title: `Upgraded successfully to ${def.plan.title}`, variant: 'success' });
        }, 500);
    };

    const onDowngrade = async () => {
        if (!def.plan.orbId) {
            return;
        }

        setLoading(true);
        const res = await apiPostPlanChange(env, { orbId: def.plan.orbId });
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
            if (res.json.data.orb_future_plan !== def.plan.orbId) {
                setLongWait(true);
                return;
            }

            clearInterval(refInterval.current);

            await Promise.all([
                queryClient.invalidateQueries({ exact: false, queryKey: ['plans'], type: 'all' }),
                queryClient.refetchQueries({ exact: false, queryKey: ['plans'], type: 'all' }),
                mutate((key) => typeof key === 'string' && key.startsWith(`/api/v1/environments`))
            ]);

            setLoading(false);
            setOpen(false);

            toast({ title: `Downgraded successfully to ${def.plan.title}`, variant: 'success' });
        }, 500);
    };

    useEffect(() => {
        if (!open && refInterval.current) {
            clearInterval(refInterval.current);
        }
    }, [open]);

    const plan = def.plan;

    if (!def.active && def.isDowngrade && !activePlan.prevPlan) {
        return null;
    }
    if (def.active && def.plan.hidden) {
        return null;
    }

    return (
        <div className={cn('w-56 flex flex-col rounded border border-border-disabled flex-shrink-0', def.active && 'bg-bg-elevated border-border-muted')}>
            <header className={cn('p-5 flex flex-col gap-3 border-b border-border-disabled', def.active && 'border-b-border-muted')}>
                <div className="flex justify-between items-center text-text-primary">
                    <div className="flex items-center gap-1.5">
                        <span className="text-md font-semibold">{def.plan.title}</span>
                        {def.active && <div className="size-1.5 bg-icon-brand rounded-full" />}
                    </div>
                    {plan.basePrice !== undefined && (
                        <div className="text-s">
                            <span className="font-semibold">{`$${def.plan.basePrice}`}</span>
                            <span className="text-s">/mo</span>
                        </div>
                    )}
                </div>
                <div className="text-text-secondary text-s leading-5 font-medium">{plan.description}</div>
            </header>
            <main className="p-5 flex flex-col gap-4 justify-between h-full">
                <div className="flex flex-col gap-3 text-s leading-5 font-medium">
                    {plan.display?.featuresHeading && <span className="text-text-secondary">{plan.display.featuresHeading}</span>}
                    {plan.display?.features.map((feature) => {
                        return (
                            <div key={feature.title} className="flex items-center gap-2 text-text-primary">
                                <Check className={cn('text-text-secondary size-4', def.active && 'text-text-brand')} />
                                {feature.title}
                            </div>
                        );
                    })}
                </div>
                {plan.display?.sub && <p className="text-text-tertiary text-s leading-5">{plan.display.sub}</p>}

                {def.active && (
                    <Button disabled variant={'secondary'} className="w-full">
                        Current plan
                    </Button>
                )}
                {!def.active && def.isUpgrade && activePlan.canChange && (
                    <Button variant={'primary'} onClick={onClick} className="w-full">
                        {def.plan.cta ? def.plan.cta : 'Upgrade plan'}
                    </Button>
                )}
                {!def.active && def.isDowngrade && activePlan.canChange && (
                    <>
                        {currentPlan?.orb_future_plan && currentPlan?.orb_future_plan === def.plan.orbId ? (
                            <div className="text-xs text-grayscale-500">Downgrade planned at the end of the month</div>
                        ) : (
                            activePlan.prevPlan && (
                                <Button variant={'primary'} onClick={onClick} className="w-full">
                                    Downgrade
                                </Button>
                            )
                        )}
                    </>
                )}
            </main>
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <div className={cn('flex flex-col justify-between text-white rounded-lg border border-grayscale-5', def.active && 'bg-grayscale-3')}>
                <div>
                    <header className="bg-grayscale-3 py-5 px-5 rounded-t-lg border-b border-b-grayscale-5">
                        <div className="flex gap-3 items-center justify-between">
                            <div className="capitalize text-lg flex gap-1 items-center">
                                {def.plan.title}
                                {def.active && <span className="bg-success-4 h-1.5 w-1.5 rounded-full inline-flex ml-2"></span>}
                            </div>
                            {plan.basePrice !== undefined && (
                                <div className="text-s">
                                    <span>${plan.basePrice}/mo</span>
                                </div>
                            )}
                        </div>
                        <div className="text-sm text-grayscale-10 mt-4">{def.plan.description}</div>
                    </header>
                    <main className={cn('flex flex-col gap-3 py-5 px-5 text-s', def.active && 'bg-grayscale-3')}>
                        {plan.display?.featuresHeading && <div className="">{plan.display?.featuresHeading}</div>}
                        {plan.display?.features.map((feature) => {
                            return (
                                <div key={feature.title}>
                                    <div className="flex items-center gap-2">
                                        <IconCheck stroke={1} className={cn(def.active && 'text-success-4')} />
                                        {feature.title}
                                    </div>
                                    {feature.sub && <div className="text-grayscale-10 ml-8">{feature.sub}</div>}
                                </div>
                            );
                        })}
                        {plan.display?.sub && <div className="border-t border-t-grayscale-600 pt-4 text-gray-400">{plan.display?.sub}</div>}
                    </main>
                </div>
                <footer className=" py-5 px-5 ">
                    {def.active && (
                        <Button disabled variant={'secondary'}>
                            Current plan
                        </Button>
                    )}
                    {!def.active && def.isUpgrade && activePlan.canChange && (
                        <Button variant={'primary'} onClick={onClick} className="cursor-pointer">
                            {def.plan.cta ? def.plan.cta : 'Upgrade plan'}
                        </Button>
                    )}
                    {!def.active && def.isDowngrade && activePlan.canChange && (
                        <>
                            {currentPlan?.orb_future_plan && currentPlan?.orb_future_plan === def.plan.orbId ? (
                                <div className="text-xs text-grayscale-500">Downgrade planned at the end of the month</div>
                            ) : (
                                activePlan.prevPlan && (
                                    <Button variant={'primary'} onClick={onClick} className="cursor-pointer">
                                        Downgrade
                                    </Button>
                                )
                            )}
                        </>
                    )}
                </footer>
            </div>
            {(!hasPaymentMethod && def.isUpgrade) || (!hasPaymentMethod && def.isDowngrade && def.plan.code !== 'free') ? (
                <DialogContent className="w-[550px] max-h-[800px]">
                    <DialogTitle>Add a payment method first</DialogTitle>
                    <StripeForm onSuccess={() => {}} />
                </DialogContent>
            ) : (
                <DialogContent className="w-[550px] max-h-[800px]">
                    <DialogTitle>
                        Confirm {def.isDowngrade ? 'Downgrade' : 'Upgrade'} to {def.plan.title}
                    </DialogTitle>
                    <DialogDescription className="text-white">
                        {def.isUpgrade ? (
                            <>
                                The {def.plan.title} plan includes a ${def.plan.basePrice} monthly base fee, plus additional usage-based charges. When you
                                upgrade, you&apos;ll be charged a prorated base fee for the current month.
                            </>
                        ) : (
                            <>
                                Your {def.plan.title} subscription will end at the end of this month and won’t renew. Any remaining usage will be billed after
                                the month ends.
                            </>
                        )}
                        {longWait && (
                            <div className="text-right text-xs text-grayscale-500 mt-2">{def.isDowngrade ? 'Downgrading...' : 'Payment is processing...'}</div>
                        )}
                    </DialogDescription>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant={'secondary'}>Cancel</Button>
                        </DialogClose>
                        {def.isDowngrade ? (
                            <Button variant={'primary'} onClick={onDowngrade}>
                                Downgrade
                            </Button>
                        ) : (
                            <Button variant={'primary'} onClick={onUpgrade}>
                                Upgrade
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            )}
        </Dialog>
    );
};
