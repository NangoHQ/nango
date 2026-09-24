import { ArrowUpRight, TriangleAlert } from 'lucide-react';

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@nangohq/design-system';

import { AlertButtonLink } from '@/components/ui/AlertButtonLink';

import type { UsageState } from '@/utils/usage';

const TITLES: Record<'near' | 'over', string> = {
    near: `You're nearing your Free plan limits.`,
    over: `You've reached your Free plan limits.`
};

interface UsageLimitBannerProps {
    /** Aggregate usage state across capped metrics (see `getAggregateUsageState`). */
    state: UsageState;
}

/**
 * In-page banner on the Free usage view — the wide counterpart to the sidebar `UsageLimitAlert`.
 * Shows only when nearing or at a plan cap, and links straight to the plan picker.
 */
export const UsageLimitBanner: React.FC<UsageLimitBannerProps> = ({ state }) => {
    if (state !== 'near' && state !== 'over') {
        return null;
    }

    return (
        <Alert variant="warning" size="wide">
            <TriangleAlert />
            <AlertTitle>{TITLES[state]}</AlertTitle>
            <AlertDescription>Upgrade for unlimited, usage-based capacity.</AlertDescription>
            <AlertActions>
                <AlertButtonLink to="/team/billing#plans">
                    Upgrade <ArrowUpRight />
                </AlertButtonLink>
            </AlertActions>
        </Alert>
    );
};
