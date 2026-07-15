import { Link } from 'react-router-dom';

import { permissions } from '@nangohq/authz';

import { Skeleton } from '@/components/ui/Skeleton';
import { usePermissions } from '@/hooks/usePermissions.js';
import { useStore } from '@/store';
import { useApiGetUsage } from '../../hooks/usePlan.js';
import { formatLimit, formatUsage, getStylesForUsage } from '../../utils/usage.js';
import { cn } from '../../utils/utils.js';

export default function UsageCard() {
    const env = useStore((state) => state.env);
    const { data: usage, isLoading } = useApiGetUsage(env);

    const { can } = usePermissions();
    const canManageBilling = can(permissions.canManageBilling);

    const content = isLoading ? (
        <>
            <Skeleton className="h-[24px]" />
            <Skeleton className="h-[24px]" />
            <Skeleton className="h-[24px]" />
        </>
    ) : (
        Object.entries(usage?.data ?? {}).map(([metric, usage]) => (
            <div key={metric} className="flex flex-row justify-between items-center">
                <span className="text-text-strong font-medium">{usage.label}</span>
                <div>
                    <UsageBadge usage={usage.usage} limit={usage.limit} />
                </div>
            </div>
        ))
    );

    const baseClassName = 'flex flex-col gap-4.5 px-3 py-3.5 text-xs rounded-sm bg-surface-panel border-[0.5px] border-border-muted';

    if (!canManageBilling) {
        return <div className={baseClassName}>{content}</div>;
    }

    return (
        <Link to={`/team/billing#usage`} className={cn(baseClassName, 'cursor-pointer transition-colors hover:bg-surface-page hover:border-transparent')}>
            {content}
        </Link>
    );
}

interface UsageBadgeProps {
    usage: number;
    limit: number | null;
}

function UsageBadge({ usage, limit }: UsageBadgeProps) {
    return (
        <div>
            <span className={cn('font-semibold px-1 py-0.5 rounded', getStylesForUsage(usage, limit))}>{formatUsage(usage)}</span>
            {limit && <span className="text-text-muted">/{formatLimit(limit)}</span>}
        </div>
    );
}
