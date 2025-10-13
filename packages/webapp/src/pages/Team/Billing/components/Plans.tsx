import { Info } from 'lucide-react';
import { useMemo } from 'react';

import { Alert, AlertDescription } from '@/components-v2/ui/alert.js';
import { Button } from '@/components-v2/ui/button';
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
        <div className="flex flex-col gap-6">
            {futurePlanMessage && (
                <Alert variant="info">
                    <Info />
                    <AlertDescription>futurePlanMessage</AlertDescription>
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
        </div>
    );
};

const PlanRow: React.FC<{ planDefinition: PlanDefinitionList }> = ({ planDefinition }) => {
    const { plan, active, isFuture, isDowngrade, isUpgrade } = planDefinition;
    return (
        <TableRow>
            <TableCell>
                <div className="inline-flex items-center gap-1">
                    {plan.title} {active && <Dot />}
                </div>
            </TableCell>
            <TableCell className="text-center">{plan.basePrice ? `From $${plan.basePrice}/month` : '—'}</TableCell>
            <TableCell className="text-right">
                {active && (
                    <Button disabled variant="secondary" className="w-27">
                        Current plan
                    </Button>
                )}
                {isFuture && (
                    <Button disabled variant="secondary" className="w-27">
                        Scheduled
                    </Button>
                )}
                {isUpgrade && !isFuture && (
                    <Button variant="primary" className="w-27">
                        Upgrade
                    </Button>
                )}
                {isDowngrade && !isFuture && (
                    <Button variant="destructive" className="w-27">
                        Downgrade
                    </Button>
                )}
            </TableCell>
        </TableRow>
    );
};

export const Dot: React.FC = () => {
    return <div className="size-1.5 rounded-full bg-icon-brand"></div>;
};
