import { Link } from 'react-router-dom';

import { Skeleton } from '../../components/ui/Skeleton.js';
import { useApiGetUsage } from '../../hooks/usePlan.js';
import { useStore } from '../../store.js';
import { cn } from '../../utils/utils.js';

const numberFormatter = Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
/**
 * Formats multiples of 1000 to K, M, B, or T
 * @example 1000 -> 1K
 * @example 2000 -> 2K
 * @example 2025 -> 2,025
 * @example 1000000 -> 1M
 * @example 1234000 -> 1,234K
 */
function formatLimit(limit: number) {
    if (limit >= 1_000_000_000_000 && limit % 1_000_000_000_000 === 0) {
        return `${numberFormatter.format(limit / 1_000_000_000_000)}T`;
    }
    if (limit >= 1_000_000_000 && limit % 1_000_000_000 === 0) {
        return `${numberFormatter.format(limit / 1_000_000_000)}B`;
    }
    if (limit >= 1_000_000 && limit % 1_000_000 === 0) {
        return `${numberFormatter.format(limit / 1_000_000)}M`;
    }
    if (limit >= 1000 && limit % 1000 === 0) {
        return `${numberFormatter.format(limit / 1000)}K`;
    }
    return numberFormatter.format(limit);
}

function formatUsage(usage: number) {
    if (usage >= 1_000_000_000_000) {
        return `${numberFormatter.format(usage / 1_000_000_000_000)}T`;
    }
    if (usage >= 1_000_000_000) {
        return `${numberFormatter.format(usage / 1_000_000_000)}B`;
    }
    if (usage >= 1_000_000) {
        return `${numberFormatter.format(usage / 1_000_000)}M`;
    }
    if (usage >= 1000) {
        return `${numberFormatter.format(usage / 1000)}K`;
    }
    return numberFormatter.format(usage);
}

export default function UsageCard() {
    const env = useStore((state) => state.env);
    const { data: usage, isLoading } = useApiGetUsage(env);

    return (
        <Link
            to={`/team/billing#usage`}
            className="flex flex-col gap-4.5 px-3 py-3.5 text-xs rounded-sm bg-bg-surface border-[0.5px] border-border-muted cursor-pointer transition-colors hover:bg-bg-elevated hover:border-transparent"
        >
            {isLoading ? (
                <>
                    <Skeleton className="h-[24px]" />
                    <Skeleton className="h-[24px]" />
                    <Skeleton className="h-[24px]" />
                </>
            ) : (
                Object.entries(usage?.data ?? {}).map(([metric, usage]) => (
                    <div key={metric} className="flex flex-row justify-between items-center">
                        <span className="text-text-primary font-medium">{usage.label}</span>
                        <div>
                            <UsageBadge usage={usage.usage} limit={usage.limit} />
                        </div>
                    </div>
                ))
            )}
        </Link>
    );
}

function getStylesForUsage(usage: number, limit: number | null) {
    if (!limit) {
        return 'text-text-primary bg-bg-subtle';
    }
    if (usage >= limit) {
        return 'text-feedback-error-fg bg-feedback-error-bg';
    }
    if (usage >= limit * 0.8) {
        return 'text-feedback-warning-fg bg-feedback-warning-bg';
    }
    return 'text-text-primary bg-bg-subtle';
}

interface UsageBadgeProps {
    usage: number;
    limit: number | null;
}

function UsageBadge({ usage, limit }: UsageBadgeProps) {
    return (
        <div>
            <span className={cn('font-semibold px-1 py-0.5 rounded', getStylesForUsage(usage, limit))}>{formatUsage(usage)}</span>
            {limit && <span className="text-text-tertiary">/{formatLimit(limit)}</span>}
        </div>
    );
}
