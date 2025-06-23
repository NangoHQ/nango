import { IconExternalLink } from '@tabler/icons-react';
import { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';

import { PaymentMethods } from './components/PaymentMethod';
import { PlanCard } from './components/PlanCard';
import { ErrorPageComponent } from '../../../components/ErrorComponent';
import { Info } from '../../../components/Info';
import { LeftNavBarItems } from '../../../components/LeftNavBar';
import { Skeleton } from '../../../components/ui/Skeleton';
import * as Table from '../../../components/ui/Table';
import { Button } from '../../../components/ui/button/Button';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { useApiGetPlans, useApiGetUsage } from '../../../hooks/usePlan';
import { useStripePaymentMethods } from '../../../hooks/useStripe';
import DashboardLayout from '../../../layout/DashboardLayout';
import { useStore } from '../../../store';
import { formatDateToInternationalFormat } from '../../../utils/utils';

import type { PlanDefinitionList } from './types';
import type { GetUsage, PlanDefinition } from '@nangohq/types';

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

        const list: PlanDefinitionList[] = [];
        let isAboveActive = currentPlan.name === 'scale_legacy' || currentPlan.name === 'starter_legacy' || currentPlan.name === 'internal';
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

    const hasPaymentMethod = useMemo<boolean>(() => {
        if (!paymentMethods || !paymentMethods.data || paymentMethods.data.length <= 0) {
            return false;
        }
        return true;
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
                    <div className="flex flex-col gap-5">
                        <h2 className="text-grayscale-10 uppercase text-sm">Usage</h2>
                        <UsageTable data={usage} isLoading={usageIsLoading} />
                    </div>
                )}

                <div className="flex flex-col gap-5">
                    <h2 className="text-grayscale-10 uppercase text-sm">Plan</h2>

                    {list?.activePlan && list.activePlan.hidden && (
                        <div className="text-white text-s flex items-center font-semibold">
                            <span className="text-grayscale-300 pr-2">Current plan:</span> {list.activePlan.title}{' '}
                            <span className="bg-success-4 h-1.5 w-1.5 rounded-full inline-flex ml-2"></span>
                        </div>
                    )}
                    {futurePlan && futurePlan.futurePlan?.code === 'free' && (
                        <Info variant={'warning'} className="mt-2">
                            Your {list?.activePlan.title} subscription has been cancelled and will terminate at the end of the month.
                        </Info>
                    )}
                    {futurePlan && futurePlan.futurePlan?.code !== 'free' && (
                        <Info variant={'warning'} className="mt-2">
                            Your {list?.activePlan.title} subscription will switch to Starter at the end of the month.
                        </Info>
                    )}
                    {list?.activePlan.hidden ? (
                        <div>
                            <a href="https://nango.dev/support">
                                <Button>Contact us to change your plan</Button>
                            </a>
                        </div>
                    ) : (
                        <div className="grid grid-cols-4 gap-4 mt-6">
                            {list?.list.map((def) => {
                                return <PlanCard key={def.plan.code} def={def} hasPaymentMethod={hasPaymentMethod} activePlan={list.activePlan} />;
                            })}
                        </div>
                    )}

                    <div className="flex text-white text-sm">
                        <Link to="https://nango.dev/pricing" target="_blank" className="flex gap-2">
                            <IconExternalLink stroke={1} size={18} />
                            View pricing page
                        </Link>
                    </div>
                </div>

                <div className="flex flex-col gap-5">
                    <h2 className="text-grayscale-10 uppercase text-sm">Payment and Invoices</h2>

                    <PaymentMethods />

                    {hasUsage && (
                        <>
                            {usageIsLoading ? (
                                <Skeleton className="w-1/2" />
                            ) : (
                                <Link to={usage?.data.customer.portalUrl || ''} target="_blank">
                                    <Button variant={'primary'}>View Invoices</Button>
                                </Link>
                            )}
                        </>
                    )}
                </div>
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
