import { IconCheck } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';

import { StripeForm } from './PaymentMethod';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '../../../../components/ui/Dialog';
import { Button } from '../../../../components/ui/button/Button';
import { apiGetCurrentPlan, apiPostPlanChange } from '../../../../hooks/usePlan';
import { useToast } from '../../../../hooks/useToast';
import { queryClient, useStore } from '../../../../store';
import { stripePromise } from '../../../../utils/stripe';
import { cn } from '../../../../utils/utils';

import type { PlanDefinitionList } from '../types';
import type { PlanDefinition } from '@nangohq/types';

export const PlanCard: React.FC<{
    def: PlanDefinitionList;
    hasPaymentMethod: boolean;
    activePlan: PlanDefinition;
}> = ({ def, hasPaymentMethod, activePlan }) => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [longWait, setLongWait] = useState(false);
    const refInterval = useRef<NodeJS.Timeout>();

    const onClick = () => {
        if (!def.plan.canUpgrade && !def.plan.canDowngrade) {
            window.open('mailto:upgrade@nango.dev', '_blank');
            return;
        }

        setOpen(true);
    };

    const onUpgrade = async () => {
        if (!def.plan.orbId) {
            return;
        }

        setLoading(true);
        const res = await apiPostPlanChange(env, { orbId: def.plan.orbId, isUpgrade: true });
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
        const res = await apiPostPlanChange(env, { orbId: def.plan.orbId, isUpgrade: false });
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

    if (!def.active && def.isDowngrade && !activePlan.canDowngrade) {
        return null;
    }
    if (def.active && def.plan.hidden) {
        return null;
    }

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
                        {plan.display?.featuresHeading && <div className="">{plan.display.featuresHeading}</div>}
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
                        {plan.display?.sub && <div className="border-t border-t-grayscale-600 pt-4 text-gray-400">{plan.display.sub}</div>}
                    </main>
                </div>
                <footer className=" py-5 px-5 ">
                    {def.active && <Button disabled>Current plan</Button>}
                    {!def.active && def.isUpgrade && (
                        <Button variant={'primary'} onClick={onClick}>
                            {def.plan.cta ? def.plan.cta : 'Upgrade plan'}
                        </Button>
                    )}
                    {!def.active && def.isDowngrade && (
                        <>
                            {activePlan.canDowngrade && (
                                <Button variant={'primary'} onClick={onClick}>
                                    Downgrade
                                </Button>
                            )}
                        </>
                    )}
                </footer>
            </div>
            {!hasPaymentMethod ? (
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
                                The {def.plan.title} plan includes a ${def.plan.basePrice} monthly base fee, plus additional usage-based charges. You&apos;ll be
                                charged a pro-rated base fee for the current month when you upgrade. Going forward, you&apos;ll be billed monthly for your usage
                                and the next month&apos;s base fee.
                            </>
                        ) : (
                            <>
                                Your {def.plan.title} subscription will end at the end of this month and won’t renew. Any remaining usage will be billed after
                                the month ends.
                            </>
                        )}

                        {/* {def.isUpgrade && (
                            <div className="mt-10 mb-4 text-sm text-grayscale-12 text-s">
                                <div className="flex items-center justify-between gap-2 py-3">
                                    <span>New plan</span>
                                    <span className="text-grayscale-13">{def.plan.title}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 py-3">
                                    <span>Plan monthly price</span>
                                    <span className="text-grayscale-13">${def.plan.basePrice}/month</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 mt-3 py-3 border-t border-grayscale-600">
                                    <div>Charged today</div>
                                    <div className="text-grayscale-13">${def.plan.basePrice} (immediate)</div>
                                </div>
                            </div>
                        )}
                        {def.isDowngrade && (
                            <div className="mt-10 mb-4 text-sm text-grayscale-12 text-s">
                                <div className="flex items-center justify-between gap-2 py-3">
                                    <span>New plan</span>
                                    <span className="text-grayscale-13">{def.plan.title}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 py-3">
                                    <span>Plan monthly price</span>
                                    <span className="text-grayscale-13">${def.plan.basePrice}/month</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 mt-3 py-3 border-t border-grayscale-600">
                                    <div>Charged today</div>
                                    <div className="text-grayscale-13">$0</div>
                                </div>
                            </div>
                        )} */}
                        {longWait && (
                            <div className="text-right text-xs text-grayscale-500 mt-2">{def.isDowngrade ? 'Downgrading...' : 'Payment is processing...'}</div>
                        )}
                    </DialogDescription>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant={'secondary'}>Cancel</Button>
                        </DialogClose>
                        {def.isDowngrade ? (
                            <Button variant={'primary'} onClick={onDowngrade} isLoading={loading}>
                                Downgrade
                            </Button>
                        ) : (
                            <Button variant={'primary'} onClick={onUpgrade} isLoading={loading}>
                                Upgrade
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            )}
        </Dialog>
    );
};
