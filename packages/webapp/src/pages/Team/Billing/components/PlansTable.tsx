import { useMemo } from 'react';

import { Button } from '@/components-v2/ui/button';
import { Table, TableBody, TableCell, TableRow } from '@/components-v2/ui/table';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useApiGetPlans } from '@/hooks/usePlan';
import { useStore } from '@/store';

import type { PlanDefinitionList } from '../types';
import type { PlanDefinition } from '@nangohq/types';

export const PlansTable: React.FC = () => {
    const env = useStore((state) => state.env);

    const { plan: currentPlan } = useEnvironment(env);
    const { data: plansList } = useApiGetPlans(env);

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
                isDowngrade: curr.prevPlan?.includes(plan.code) || false,
                isUpgrade: curr.nextPlan?.includes(plan.code) || false
            });
        }
        return { list, activePlan: curr };
    }, [currentPlan, plansList]);

    return (
        <Table>
            <TableBody>
                {plans?.activePlan.hidden && (
                    <TableRow>
                        <TableCell>
                            <div className="inline-flex items-center gap-1">
                                {plans.activePlan.title} <Dot />
                            </div>
                        </TableCell>
                        <TableCell className="text-center">{plans.activePlan.basePrice ? `From $${plans.activePlan.basePrice}/month` : '—'}</TableCell>
                        <TableCell className="text-right">
                            <Button disabled variant="secondary" className="w-27">
                                Current plan
                            </Button>
                        </TableCell>
                    </TableRow>
                )}
                {plans?.list.map((plan) => {
                    return (
                        <TableRow key={plan.plan.code}>
                            <TableCell>
                                <div className="inline-flex items-center gap-1">
                                    {plan.plan.title} {plan.active && <Dot />}
                                </div>
                            </TableCell>
                            <TableCell className="text-center">{plan.plan.basePrice ? `From $${plan.plan.basePrice}/month` : '—'}</TableCell>
                            <TableCell className="text-right">
                                {plan.active && (
                                    <Button disabled variant="secondary" className="w-27">
                                        Current plan
                                    </Button>
                                )}
                                {plan.isUpgrade && (
                                    <Button variant="primary" className="w-27">
                                        Upgrade
                                    </Button>
                                )}
                                {plan.isDowngrade && (
                                    <Button variant="destructive" className="w-27">
                                        Downgrade
                                    </Button>
                                )}
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
};

export const Dot: React.FC = () => {
    return <div className="size-1.5 rounded-full bg-icon-brand"></div>;
};
