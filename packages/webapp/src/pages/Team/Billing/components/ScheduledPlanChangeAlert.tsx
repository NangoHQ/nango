import { Clock9 } from 'lucide-react';
import { useMemo } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@nangohq/design-system';

import { useApiGetPlans, useCurrentPlan } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { pendingPlanChange } from '../summaryState';

/**
 * The summary strip states the same change at the top of the page, but legacy and enterprise
 * accounts get no strip and still need to see it here.
 *
 * Self-fetching because both queries are already cached by the plans section.
 */
export const ScheduledPlanChangeAlert: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data: environmentData } = useCurrentPlan(env);
    const plan = environmentData?.plan;
    const { data: plansList, isPending: arePlansPending } = useApiGetPlans(env);

    const change = useMemo(() => {
        // Until the plans list settles a title falls back to its raw plan code, and
        // "Switches to growth-v2" is not a sentence to show a customer.
        if (!plan || arePlansPending) {
            return null;
        }
        return pendingPlanChange({ plan, plans: plansList?.data, now: new Date() });
    }, [plan, plansList, arePlansPending]);

    if (!change) {
        return null;
    }

    return (
        <Alert variant="warning">
            <Clock9 />
            <AlertTitle>Scheduled plan change</AlertTitle>
            <AlertDescription>
                {change.toCode === 'free' || change.toCode === 'free-uncapped'
                    ? `Your subscription will be cancelled on ${change.at}`
                    : `Switches to ${change.toPlanTitle} on ${change.at}`}
            </AlertDescription>
        </Alert>
    );
};
