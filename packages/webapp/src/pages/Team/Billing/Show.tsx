import { IconExternalLink } from '@tabler/icons-react';
import { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';

import { Payment } from './components/Payment';
import { PaymentMethods } from './components/PaymentMethod';
// import { PlanCard } from './components/PlanCard';
import { Plans } from './components/Plans';
import { UsageTable } from './components/UsageTable';
import { ErrorPageComponent } from '../../../components/ErrorComponent';
import { Info } from '../../../components/Info';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Button } from '../../../components/ui/button/Button';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { useApiGetBillingUsage, useApiGetPlans } from '../../../hooks/usePlan';
import DashboardLayout from '../../../layout/DashboardLayout';
import { useStore } from '../../../store';
import { formatDateToInternationalFormat } from '../../../utils/utils';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components-v2/Navigation';
import { StyledLink } from '@/components-v2/StyledLink';

import type { PlanDefinitionList } from './types';
import type { PlanDefinition } from '@nangohq/types';

export const TeamBilling: React.FC = () => {
    const env = useStore((state) => state.env);

    const { data: usage, isLoading: usageIsLoading } = useApiGetBillingUsage(env);

    return (
        <DashboardLayout className="flex flex-col gap-8">
            <Helmet>
                <title>Billing - Nango</title>
            </Helmet>
            <h2 className="text-text-primary text-2xl font-bold">Billing & Usage</h2>
            <Navigation defaultValue="usage" className="max-w-full">
                <NavigationList>
                    <NavigationTrigger value={'usage'}>Usage</NavigationTrigger>
                    <NavigationTrigger value={'plans'}>Plans</NavigationTrigger>
                    <NavigationTrigger value={'payment-and-invoices'}>Payment & Invoices</NavigationTrigger>
                </NavigationList>
                <NavigationContent value={'usage'} className="w-full flex flex-col gap-6">
                    <UsageTable data={usage} isLoading={usageIsLoading} />
                    {usage?.data.customer.portalUrl && (
                        <StyledLink icon to={usage.data.customer.portalUrl} type="external">
                            View usage details
                        </StyledLink>
                    )}
                </NavigationContent>
                <NavigationContent value={'plans'} className="w-full overflow-x-auto">
                    <Plans />
                </NavigationContent>
                <NavigationContent value={'payment-and-invoices'} className="w-full">
                    <Payment />
                </NavigationContent>
            </Navigation>
        </DashboardLayout>
    );
};

export const TeamBillingOld: React.FC = () => {
    const env = useStore((state) => state.env);

    const { error, plan: currentPlan, loading } = useEnvironment(env);
    const { data: plansList } = useApiGetPlans(env);
    const { data: usage, error: usageError, isLoading: usageIsLoading } = useApiGetBillingUsage(env);
    // const { data: paymentMethods } = useStripePaymentMethods(env);

    const plans = useMemo<null | { list: PlanDefinitionList[]; activePlan: PlanDefinition }>(() => {
        if (!currentPlan || !plansList) {
            return null;
        }

        const curr = plansList.data.find((p) => p.code === currentPlan.name)!;

        const list: PlanDefinitionList[] = [];
        for (const plan of plansList.data) {
            const same = plan.code === currentPlan.name;
            if (plan.hidden) {
                continue;
            }

            list.push({
                plan,
                active: same,
                isDowngrade: curr.prevPlan?.includes(plan.code) || false,
                isUpgrade: curr.nextPlan?.includes(plan.code) || false
            });
        }
        return { list, activePlan: curr };
    }, [currentPlan, plansList]);

    // const hasPaymentMethod = useMemo<boolean>(() => {
    //     if (!paymentMethods || !paymentMethods.data || paymentMethods.data.length <= 0) {
    //         return false;
    //     }
    //     return true;
    // }, [paymentMethods]);

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
            <DashboardLayout>
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
        return <ErrorPageComponent title="Billing" error={error} />;
    }

    if (!currentPlan) {
        return null;
    }

    const hasUsage = usageIsLoading || !usageError;

    return (
        <DashboardLayout>
            <Helmet>
                <title>Billing - Nango</title>
            </Helmet>
            <h2 className="text-3xl font-semibold text-white mb-16">Billing</h2>
            <div className="flex flex-col gap-10">
                {hasUsage && (
                    <div className="flex flex-col gap-5">
                        <h2 className="text-grayscale-10 uppercase text-sm">Usage</h2>
                        <div className="flex flex-col gap-4">
                            <UsageTable data={usage} isLoading={usageIsLoading} />
                            {usageIsLoading ? (
                                <Skeleton className="w-32" />
                            ) : (
                                <Link to={usage?.data.customer.portalUrl || ''} target="_blank">
                                    <Button variant={'secondary'}>View detailed usage</Button>
                                </Link>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-5">
                    <h2 className="text-grayscale-10 uppercase text-sm">Plans</h2>

                    {plans?.activePlan && plans.activePlan.hidden && (
                        <div className="text-white text-s flex items-center font-semibold">
                            <span className="text-grayscale-300 pr-2">Current plan:</span> {plans.activePlan.title}{' '}
                            <span className="bg-success-4 h-1.5 w-1.5 rounded-full inline-flex ml-2"></span>
                        </div>
                    )}
                    {futurePlan && futurePlan.futurePlan?.code === 'free' && (
                        <Info variant={'warning'} className="mt-2">
                            Your {plans?.activePlan.title} subscription has been cancelled and will terminate at the end of the month.
                        </Info>
                    )}
                    {futurePlan && futurePlan.futurePlan?.code !== 'free' && (
                        <Info variant={'warning'} className="mt-2">
                            Your {plans?.activePlan.title} subscription will switch to Starter at the end of the month.
                        </Info>
                    )}
                    {plans?.activePlan.hidden ? (
                        <div>
                            <a href="https://nango.dev/support">
                                <Button>Contact us to change your plan</Button>
                            </a>
                        </div>
                    ) : (
                        <div className="grid grid-cols-4 gap-4 mt-6">
                            {/* {plans?.list.map((def) => {
                                return (
                                    <PlanCard
                                        key={def.plan.code}
                                        def={def}
                                        hasPaymentMethod={hasPaymentMethod}
                                        activePlan={plans.activePlan}
                                        currentPlan={currentPlan}
                                    />
                                );
                            })} */}
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
                                    <Button variant={'secondary'}>View Invoices</Button>
                                </Link>
                            )}
                        </>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
};
