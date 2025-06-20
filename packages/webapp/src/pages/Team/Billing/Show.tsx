import { IconArrowRight, IconExternalLink } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { mutate } from 'swr';

import { PaymentMethod } from './components/PaymentMethod';
import { ErrorPageComponent } from '../../../components/ErrorComponent';
import { Info } from '../../../components/Info';
import { LeftNavBarItems } from '../../../components/LeftNavBar';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '../../../components/ui/Dialog';
import { Skeleton } from '../../../components/ui/Skeleton';
import * as Table from '../../../components/ui/Table';
import { Button } from '../../../components/ui/button/Button';
import { Tag } from '../../../components/ui/label/Tag';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { apiGetCurrentPlan, apiPostPlanChange, useApiGetPlans, useApiGetUsage } from '../../../hooks/usePlan';
import { useStripePaymentMethods } from '../../../hooks/useStripe';
import { useToast } from '../../../hooks/useToast';
import DashboardLayout from '../../../layout/DashboardLayout';
import { queryClient, useStore } from '../../../store';
import { cn, formatDateToInternationalFormat } from '../../../utils/utils';

import type { GetUsage, PlanDefinition } from '@nangohq/types';

interface PlanDefinitionList {
    plan: PlanDefinition;
    active: boolean;
    isDowngrade?: boolean;
    isUpgrade?: boolean;
}

export const TeamBilling: React.FC = () => {
    const env = useStore((state) => state.env);

    const { error, plan: currentPlan, loading } = useEnvironment(env);
    const { data: plansList } = useApiGetPlans(env);
    const { data: usage, error: usageError, isLoading: usageIsLoading } = useApiGetUsage(env);
    const { data: paymentMethods } = useStripePaymentMethods(env);

    const list = useMemo<null | { list: PlanDefinitionList[]; activePlan: PlanDefinition }>(() => {
        if (!currentPlan || !plansList) {
            return null;
        }

        const curr = plansList.data.find((p) => p.code === currentPlan.name)!;
        // No self downgrade or old plan
        if (
            currentPlan.name === 'scale_legacy' ||
            currentPlan.name === 'enterprise_legacy' ||
            currentPlan.name === 'starter_legacy' ||
            currentPlan.name === 'internal'
        ) {
            return { list: [{ plan: curr, active: true, canPick: false }], activePlan: curr };
        }

        const list: PlanDefinitionList[] = [];
        let isAboveActive = false;
        for (const plan of plansList.data) {
            const same = plan.code === currentPlan.name;
            if (plan.hidden && !same) {
                continue;
            }

            list.push({
                plan,
                active: same,
                isDowngrade: !isAboveActive,
                isUpgrade: isAboveActive
            });
            if (same) {
                isAboveActive = true;
            }
        }
        return { list, activePlan: curr };
    }, [currentPlan, plansList]);

    const card = useMemo<string | null>(() => {
        if (!paymentMethods || !paymentMethods.data || paymentMethods.data.length <= 0 || !paymentMethods.data[0]) {
            return null;
        }
        return paymentMethods.data[0];
    }, [paymentMethods]);

    const futurePlan = useMemo(() => {
        if (!currentPlan?.orb_future_plan) {
            return null;
        }

        return {
            until: formatDateToInternationalFormat(currentPlan.orb_future_plan_at!),
            futurePlan: plansList?.data.find((p) => p.orbId === currentPlan.orb_future_plan)
        };
    }, [currentPlan, plansList]);

    if (loading) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.TeamBilling}>
                <Helmet>
                    <title>Billing - Nango</title>
                </Helmet>
                <h2 className="text-3xl font-semibold text-white mb-16">Billing</h2>
                <div className="flex flex-col gap-4">
                    <Skeleton className="w-[250px]" />
                    <Skeleton className="w-[250px]" />
                </div>
            </DashboardLayout>
        );
    }

    if (error) {
        return <ErrorPageComponent title="Billing" error={error} page={LeftNavBarItems.TeamBilling} />;
    }

    if (!currentPlan) {
        return null;
    }

    const hasUsage = usageIsLoading || !usageError;

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.TeamBilling}>
            <Helmet>
                <title>Billing - Nango</title>
            </Helmet>
            <h2 className="text-3xl font-semibold text-white mb-16">Billing</h2>
            <div className="flex flex-col gap-10">
                {hasUsage && (
                    <div className="flex flex-col gap-2.5">
                        <h2 className="text-grayscale-10 uppercase text-sm">Usage</h2>
                        <UsageTable data={usage} isLoading={usageIsLoading} />
                    </div>
                )}

                <div className="flex flex-col gap-2.5 h-20">
                    <h2 className="text-grayscale-10 uppercase text-sm">Payment Methods</h2>

                    <PaymentMethod />
                </div>

                <div className="flex flex-col gap-2.5">
                    <h2 className="text-grayscale-10 uppercase text-sm">Plan</h2>

                    {futurePlan && (
                        <Info variant={'warning'}>
                            You current {list?.activePlan.title} plan has been cancelled and will be active until {futurePlan.until}. Your next plan is{' '}
                            {futurePlan.futurePlan?.title}
                        </Info>
                    )}
                    <div className="grid grid-cols-4 gap-4">
                        {list?.list.map((def) => {
                            return <PlanCard key={def.plan.code} def={def} hasPaymentMethod={card !== null} activePlan={list.activePlan} />;
                        })}
                    </div>

                    <div className="flex text-white text-sm">
                        <Link to="https://nango.dev/pricing" target="_blank" className="flex gap-2">
                            <IconExternalLink stroke={1} size={18} />
                            View pricing page
                        </Link>
                    </div>
                </div>
                {hasUsage && (
                    <div className="flex gap-4 items-center">
                        <h2 className="text-grayscale-10 uppercase text-sm">Billing and Invoicing</h2>

                        {usageIsLoading ? (
                            <Skeleton className="w-1/2" />
                        ) : (
                            <Link to={usage?.data.customer.portalUrl || ''} target="_blank">
                                <Button variant={'primary'}>Manage Billing</Button>
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
};

const UsageTable: React.FC<{ data: GetUsage['Success'] | undefined; isLoading: boolean }> = ({ data, isLoading }) => {
    const currentMonth = useMemo(() => {
        return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date());
    }, []);
    const previousMonth = useMemo(() => {
        const prev = new Date();
        prev.setMonth(prev.getMonth() - 1);
        return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(prev);
    }, []);

    if (isLoading || !data) {
        return (
            <div className="flex flex-col gap-2">
                <Skeleton className="w-1/2" />
                <Skeleton className="w-1/2" />
                <Skeleton className="w-1/2" />
            </div>
        );
    }

    return (
        <Table.Table>
            <Table.Header>
                <Table.Row>
                    <Table.Head className="w-1/2"></Table.Head>
                    <Table.Head className="text-center">Current ({currentMonth})</Table.Head>
                    <Table.Head className="text-center">Previous ({previousMonth})</Table.Head>
                </Table.Row>
            </Table.Header>
            <Table.Body>
                {data.data.current.map((row) => {
                    return (
                        <Table.Row key={row.id}>
                            <Table.Cell>{row.name}</Table.Cell>
                            <Table.Cell className="text-center">{row.quantity}</Table.Cell>
                            <Table.Cell className="text-center">{data.data.previous.find((prev) => prev.id === row.id)?.quantity}</Table.Cell>
                        </Table.Row>
                    );
                })}
            </Table.Body>
        </Table.Table>
    );
};

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

        if (!hasPaymentMethod) {
            toast({ title: 'Please, add a payment method first', variant: 'error' });
            return;
        }

        setOpen(true);
    };

    const onUpgrade = async () => {
        if (!def.plan.orbId) {
            return;
        }

        setLoading(true);
        const res = await apiPostPlanChange(env, { orbId: def.plan.orbId, immediate: true });
        if ('error' in res.json) {
            setLoading(false);
            toast({ title: 'Failed to upgrade, an error occurred', variant: 'error' });
            return;
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
        const res = await apiPostPlanChange(env, { orbId: def.plan.orbId, immediate: false });
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

            toast({ title: `Upgraded successfully to ${def.plan.title}`, variant: 'success' });
        }, 500);
    };

    useEffect(() => {
        if (!open && refInterval.current) {
            clearInterval(refInterval.current);
        }
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <div
                className={cn(
                    'flex flex-col gap-4 text-white rounded-lg bg-grayscale-3 py-7 px-6 border border-grayscale-5',
                    def.active && 'bg-grayscale-1 border-grayscale-7'
                )}
            >
                <div className="flex flex-col gap-2.5">
                    <header className="flex gap-3 items-center">
                        <div className="capitalize">{def.plan.title}</div>
                        {def.active && <div className="bg-success-4 h-1.5 w-1.5 rounded-full"></div>}
                    </header>
                    <div className="text-sm text-grayscale-10">{def.plan.description}</div>
                </div>
                <footer>
                    {def.active && <Button disabled>Current plan</Button>}
                    {!def.active && def.isUpgrade && (
                        <Button variant={'primary'} onClick={onClick}>
                            {def.plan.cta ? def.plan.cta : 'Upgrade plan'}
                        </Button>
                    )}
                    {!def.active && def.isDowngrade && (
                        <>
                            {activePlan.canDowngrade ? (
                                <Button variant={'primary'} onClick={onClick}>
                                    Downgrade
                                </Button>
                            ) : (
                                <Button variant={'primary'}>Contact us to downgrade</Button>
                            )}
                        </>
                    )}
                </footer>
            </div>

            <DialogContent className="w-[550px] max-h-[800px]">
                <DialogTitle>
                    {def.isDowngrade ? 'Downgrade' : 'Upgrade'} to {def.plan.title}
                </DialogTitle>
                <DialogDescription className="text-white">
                    {def.isUpgrade ? (
                        <>
                            {def.plan.title} plan has a base price of ${def.plan.basePrice}/month. After {def.isDowngrade ? 'downgrading' : 'upgrading'}, an
                            amount of ${def.plan.basePrice} will be added to this month&apos;s invoice and your credit card will be charged immediately.
                        </>
                    ) : (
                        <>Downgrade will happen at the end of the month, you will keep all the features of your current plan until this period.</>
                    )}

                    {def.isUpgrade && (
                        <div className="mt-10 mb-4 text-foreground-light text-sm">
                            <div className="flex items-center justify-between gap-2 border-b border-grayscale-600">
                                <div className="py-2 pl-0 flex items-center gap-4">
                                    <span>{def.plan.title}</span>
                                    <Tag variant={'success'} size="sm">
                                        new
                                    </Tag>
                                </div>
                                <div className="py-2 pr-0 text-right" translate="no">
                                    ${def.plan.basePrice}
                                </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 border-b border-grayscale-600 text-foreground text-s">
                                <div className="py-2 pl-0">Charged today</div>
                                <div className="py-2 pr-0 text-right" translate="no">
                                    ${def.plan.basePrice}
                                </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 border-b border-grayscale-600 text-foreground text-s">
                                <div className="py-2 pl-0">Charged at the end of the month</div>
                                <div className="py-2 pr-0 text-right" translate="no">
                                    usage
                                </div>
                            </div>
                        </div>
                    )}
                    {def.isDowngrade && (
                        <div className="mt-10 mb-4 text-foreground-light text-sm">
                            <div className="flex items-center justify-between gap-2 border-b border-grayscale-600">
                                <div className="py-2 pl-0 flex items-center gap-4 text-white">
                                    <span className="line-through text-grayscale-500">{activePlan.title}</span>
                                    <IconArrowRight size={18} className="text-grayscale-500" />
                                    <span>{def.plan.title}</span>
                                    <Tag variant={'success'} size="sm">
                                        new
                                    </Tag>
                                </div>
                                <div className="py-2 pr-0 text-right flex gap-2" translate="no">
                                    <span className="line-through text-grayscale-500">${activePlan.basePrice}</span>
                                    <IconArrowRight size={18} className="text-grayscale-500" />
                                    <span>${def.plan.basePrice}</span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 border-b border-grayscale-600 text-foreground text-s">
                                <div className="py-2 pl-0">Charged today</div>
                                <div className="py-2 pr-0 text-right" translate="no">
                                    0
                                </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 border-b border-grayscale-600 text-foreground text-s">
                                <div className="py-2 pl-0">Charged at the beginning of the next month</div>
                                <div className="py-2 pr-0 text-right" translate="no">
                                    ${def.plan.basePrice}
                                </div>
                            </div>
                        </div>
                    )}
                    {longWait && <div className="text-right text-xs text-grayscale-500">Waiting for our payment provider...</div>}
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
        </Dialog>
    );
};
