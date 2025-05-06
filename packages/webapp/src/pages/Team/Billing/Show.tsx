import { IconExternalLink } from '@tabler/icons-react';
import { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';

import { ErrorPageComponent } from '../../../components/ErrorComponent';
import { LeftNavBarItems } from '../../../components/LeftNavBar';
import { Skeleton } from '../../../components/ui/Skeleton';
import * as Table from '../../../components/ui/Table';
import { Button } from '../../../components/ui/button/Button';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { useApiGetPlans, useApiGetUsage } from '../../../hooks/usePlan';
import DashboardLayout from '../../../layout/DashboardLayout';
import { useStore } from '../../../store';
import { cn } from '../../../utils/utils';

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

    const plans = useMemo<PlanDefinitionList[]>(() => {
        if (!currentPlan || !plansList) {
            return [];
        }

        // No self downgrade or old plan
        if (currentPlan.name === 'scale' || currentPlan.name === 'enterprise' || currentPlan.name === 'starter' || currentPlan.name === 'internal') {
            return [{ plan: plansList.data.find((p) => p.code === currentPlan.name)!, active: true }];
        }

        const list: PlanDefinitionList[] = [];
        let isAboveActive = false;
        for (const plan of plansList.data) {
            const same = plan.code === currentPlan.name;
            if (plan.hidden && !same) {
                continue;
            }

            list.push({ plan, active: same, isDowngrade: !isAboveActive, isUpgrade: isAboveActive });
            if (same) {
                isAboveActive = true;
            }
        }
        return list;
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
                <div className="flex flex-col gap-2.5">
                    <h2 className="text-grayscale-10 uppercase text-sm">Plan</h2>
                    <div className="grid grid-cols-3 gap-4">
                        {plans.map((def) => {
                            return <PlanCard key={def.plan.code} env={env} def={def} />;
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

export const PlanCard: React.FC<{ env: string; def: PlanDefinitionList }> = ({ def }) => {
    return (
        <Link
            className={cn(
                'flex flex-col gap-4 text-white rounded-lg bg-grayscale-3 py-7 px-6 border border-grayscale-5',
                def.active && 'bg-grayscale-1 border-grayscale-7'
            )}
            target="_blank"
            to={'https://nango.dev/pricing'}
            // to={def.above && !def.plan.canUpgrade ? 'mailto:upgrade@nango.dev' : ''}
            // onClick={onClickPlan}
        >
            <div className="flex flex-col gap-2.5">
                <header className="flex gap-3 items-center">
                    <div className="capitalize">{def.plan.title}</div>
                    {def.active && <div className="bg-success-4 h-1.5 w-1.5 rounded-full"></div>}
                </header>
                <div className="text-sm text-grayscale-10">{def.plan.description}</div>
            </div>
            {/* <footer>
                {!def.active && (
                    <Button variant={'primary'} isLoading={loading}>
                        {def.plan.cta ? def.plan.cta : def.below ? 'Downgrade Plan' : 'Upgrade plan'}
                    </Button>
                )}
            </footer> */}
        </Link>
    );
};
