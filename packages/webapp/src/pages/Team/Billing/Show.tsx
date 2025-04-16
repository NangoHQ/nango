import { IconExternalLink } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';

import { ErrorPageComponent } from '../../../components/ErrorComponent';
import { LeftNavBarItems } from '../../../components/LeftNavBar';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Button } from '../../../components/ui/button/Button';
import { Tag } from '../../../components/ui/label/Tag';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { useApiGetPlans } from '../../../hooks/usePlan';
import { apiPostStripeSessionCheckout } from '../../../hooks/useStripe';
import DashboardLayout from '../../../layout/DashboardLayout';
import { useStore } from '../../../store';
import { cn } from '../../../utils/utils';

import type { PlanDefinition } from '@nangohq/types';

interface PlanDefinitionList {
    plan: PlanDefinition;
    active: boolean;
    below?: boolean;
    above?: boolean;
}

export const TeamBilling: React.FC = () => {
    const env = useStore((state) => state.env);

    const { error, plan: currentPlan, loading } = useEnvironment(env);
    const { data: plansList } = useApiGetPlans(env);

    const plans = useMemo<PlanDefinitionList[]>(() => {
        if (!currentPlan || !plansList) {
            return [];
        }

        // No self downgrade or old plan
        if (currentPlan.name === 'scale' || currentPlan.name === 'enterprise' || currentPlan.name === 'starter') {
            return [{ plan: plansList.data.find((p) => p.code === currentPlan.name)!, active: true }];
        }

        const list: PlanDefinitionList[] = [];
        let passedActive = false;
        for (const plan of plansList.data) {
            const same = plan.code === currentPlan.name;
            if (plan.hidden && !same) {
                continue;
            }

            list.push({ plan, active: same, below: !passedActive, above: passedActive });
            if (same) {
                passedActive = true;
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

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.TeamBilling}>
            <Helmet>
                <title>Billing - Nango</title>
            </Helmet>
            <h2 className="text-3xl font-semibold text-white mb-16">Billing</h2>
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2.5">
                    <h2 className="text-grayscale-10">Plan List</h2>
                    <div className="grid grid-cols-3 gap-4">
                        {plans.map((def) => {
                            return <PlanCard key={def.plan.code} env={env} def={def} />;
                        })}
                    </div>

                    <div className="flex justify-end text-white text-sm">
                        <Link to="https://nango.dev/pricing" target="_blank">
                            <Button variant={'link'}>
                                <IconExternalLink stroke={1} size={18} />
                                View pricing page
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
};

export const PlanCard: React.FC<{ env: string; def: PlanDefinitionList }> = ({ env, def }) => {
    const [loading, setLoading] = useState(false);

    const onClickPlan: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
        if (def.above && (!def.plan.canUpgrade || !def.plan.stripLookupKey)) {
            // do nothing
            return;
        }
        if (def.active) {
            return;
        }
        e.preventDefault();

        async function checkout() {
            setLoading(true);
            try {
                if (def.below) {
                    // cancel plan
                } else if (def.above) {
                    // Upgrade
                    const session = await apiPostStripeSessionCheckout(env, { priceKey: def.plan.stripLookupKey! });
                    if ('error' in session.json) {
                        return;
                    }

                    window.location.href = session.json.data.url;
                }
            } finally {
                setLoading(false);
            }
        }
        void checkout();
    };

    return (
        <Link
            className={cn(
                'flex flex-col gap-4 text-white rounded-lg bg-grayscale-3 py-7 px-6 border border-grayscale-4',
                def.active && 'bg-grayscale-1 border-grayscale-7'
            )}
            to={def.above && !def.plan.canUpgrade ? 'mailto:upgrade@nango.dev' : ''}
            onClick={onClickPlan}
        >
            <div className="flex flex-col gap-2.5">
                <header className="flex gap-3 items-center">
                    <div>
                        {def.active && <Tag variant={'neutral'}>Current</Tag>}
                        {def.below && !def.active && <Tag variant={'gray1'}>Downgrade</Tag>}
                        {def.above && <Tag variant={'info'}>Upgrade</Tag>}
                    </div>
                    <div className="capitalize">{def.plan.title}</div>
                </header>
                <div className="text-sm text-grayscale-10">{def.plan.description}</div>
            </div>
            <footer>
                {!def.active && (
                    <Button variant={'emptyFaded'} isLoading={loading}>
                        {def.plan.cta ? def.plan.cta : def.below ? 'Downgrade Plan' : 'Upgrade plan'}
                    </Button>
                )}
            </footer>
        </Link>
    );
};
