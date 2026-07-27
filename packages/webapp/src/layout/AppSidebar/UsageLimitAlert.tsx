import { CircleAlert, ExternalLink, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useStore } from '@/store';
import { useApiGetUsage } from '../../hooks/usePlan.js';
import { getAggregateUsageState } from '../../utils/usage.js';
import { cn } from '../../utils/utils.js';

const VARIANTS = {
    near: {
        Icon: TriangleAlert,
        title: 'Nearing plan limits',
        body: 'Usage is close to your Free plan limits.',
        container: 'bg-status-warning-bg border-status-warning-border',
        accent: 'text-status-warning-text'
    },
    over: {
        Icon: CircleAlert,
        title: 'Plan limits reached',
        body: `You've hit Free plan limits. Upgrade to keep things running.`,
        container: 'bg-status-danger-bg border-status-danger-border',
        accent: 'text-status-danger-text'
    }
} as const;

/**
 * Sidebar alert for Free accounts approaching or exceeding their plan caps. Rolls the per-metric
 * usage up to a single state (`getAggregateUsageState`) and shows a warning or danger banner linking
 * to the usage page; renders nothing while loading or when usage is comfortably under every cap.
 */
export default function UsageLimitAlert() {
    const env = useStore((state) => state.env);
    const { data: usage } = useApiGetUsage(env);

    const state = getAggregateUsageState(usage?.data ?? {});
    if (state !== 'near' && state !== 'over') {
        return null;
    }

    const { Icon, title, body, container, accent } = VARIANTS[state];

    return (
        <div className={cn('flex gap-2 rounded border-[0.5px] px-2 py-2', container)}>
            <Icon className={cn('size-4 shrink-0', accent)} />
            <div className="flex flex-col gap-0.5">
                <p className={cn('text-body-small-regular', accent)}>{title}</p>
                <p className="text-body-small-regular text-text-default">{body}</p>
                <Link
                    to="/team/billing#usage"
                    className={cn('inline-flex w-fit items-center gap-1 mt-1 rounded-[2px] underline text-body-small-regular focus-default', accent)}
                >
                    View usage
                    <ExternalLink className="size-3" />
                </Link>
            </div>
        </div>
    );
}
