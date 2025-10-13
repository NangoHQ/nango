import { Info } from 'lucide-react';
import { useMemo } from 'react';

import { StyledLink } from '@/components-v2/StyledLink.js';
import { Alert, AlertDescription } from '@/components-v2/ui/alert.js';
import { Button, ButtonLink } from '@/components-v2/ui/button';
import { Table, TableBody, TableCell, TableRow } from '@/components-v2/ui/table';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useApiGetPlans } from '@/hooks/usePlan';
import { useStore } from '@/store';

import type { PlanDefinitionList } from '../types.js';
import type { PlanDefinition } from '@nangohq/types';

export const Plans: React.FC = () => {
    const env = useStore((state) => state.env);

    const { plan: currentPlan } = useEnvironment(env);
    const { data: plansList } = useApiGetPlans(env);

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
                        return <PlanRow key={plan.plan.code} planDefinition={plan} />;
                    })}
                </TableBody>
            </Table>
            <StyledLink to="https://nango.dev/pricing" icon type="external">
                View full pricing
            </StyledLink>
        </div>
    );
};

const PlanRow: React.FC<{ planDefinition: PlanDefinitionList }> = ({ planDefinition }) => {
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
                <Button variant="primary" className="w-27">
                    Upgrade
                </Button>
            );
        }
        if (isDowngrade && plan.canChange) {
            return (
                <Button variant="destructive" className="w-27">
                    Downgrade
                </Button>
            );
        }
        return (
            <ButtonLink variant="secondary" className="w-27" to="https://nango.dev/support" target="_blank">
                Contact us
            </ButtonLink>
        );
    }, [active, isFuture, isUpgrade, plan.canChange, isDowngrade]);

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

export const Dot: React.FC = () => {
    return <div className="size-1.5 rounded-full bg-icon-brand"></div>;
};
