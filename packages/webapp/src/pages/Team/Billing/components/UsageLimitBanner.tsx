import { ExternalLink, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { UsageState } from '@/utils/usage';

// The in-page banner stays at warning level for both states — only the copy escalates.
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded border-[0.5px] border-status-warning-border bg-status-warning-bg px-2 py-2">
            <div className="flex flex-1 min-w-0 items-start gap-2">
                <TriangleAlert className="size-4 shrink-0 text-status-warning-text" />
                <div className="flex flex-col gap-0.5">
                    <p className="text-body-small-regular text-status-warning-text">{TITLES[state]}</p>
                    <p className="text-body-small-regular text-text-default">Upgrade for unlimited, usage-based capacity.</p>
                </div>
            </div>
            <Link
                to="/team/billing#plans"
                className="inline-flex w-fit items-center gap-1 rounded-[2px] underline text-body-small-regular text-status-warning-text focus-default"
            >
                Upgrade
                <ExternalLink className="size-3" />
            </Link>
        </div>
    );
};
