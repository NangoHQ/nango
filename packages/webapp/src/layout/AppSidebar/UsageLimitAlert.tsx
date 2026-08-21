import { ArrowUpRight, TriangleAlert } from 'lucide-react';

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@nangohq/design-system';

import { AlertButtonLink } from '@/components/ui/AlertButtonLink';
import { usePlanOverrideStore } from '@/features/planOverride';
import { useStore } from '@/store';
import { useApiGetUsage } from '../../hooks/usePlan.js';
import { getAggregateUsageState } from '../../utils/usage.js';

const COPY: Record<'near' | 'over', { title: string; body: string }> = {
    near: {
        title: 'Nearing plan limits',
        body: 'Usage is close to your Free plan limits.'
    },
    over: {
        title: 'Plan limits reached',
        body: `You've hit Free plan limits. Upgrade to keep things running.`
    }
};

/**
 * Sidebar alert for Free accounts approaching or exceeding their plan caps. Rolls the per-metric
 * usage up to a single state (`getAggregateUsageState`) and shows a warning linking to the usage
 * page; renders nothing while loading or when usage is comfortably under every cap.
 */
export default function UsageLimitAlert() {
    const env = useStore((state) => state.env);
    const { data: usage } = useApiGetUsage(env);
    const usageLimitOverride = usePlanOverrideStore((s) => s.usageLimitOverride);

    // Dev-tool override (planOverride.ts) — real usage rarely sits near a cap on demand.
    const state = usageLimitOverride ?? getAggregateUsageState(usage?.data ?? {});
    if (state !== 'near' && state !== 'over') {
        return null;
    }

    const { title, body } = COPY[state];

    return (
        <Alert variant="warning" size="compact">
            <TriangleAlert />
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>{body}</AlertDescription>
            <AlertActions>
                <AlertButtonLink to="/team/billing#usage">
                    View usage <ArrowUpRight />
                </AlertButtonLink>
            </AlertActions>
        </Alert>
    );
}
