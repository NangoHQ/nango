import { IconInfoCircle } from '@tabler/icons-react';
import { useMemo } from 'react';

import { Skeleton } from '../components/ui/Skeleton.js';
import { useApiGetUsage } from '../hooks/usePlan.js';
import { useStore } from '../store.js';
import { cn } from '../utils/utils.js';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.js';
import { ButtonLink } from '@/components-v2/ui/button.js';

function getColorForUsage(usage: number, limit: number | null) {
    if (!limit) {
        return 'text-text-primary';
    }
    if (usage >= limit) {
        return 'text-feedback-error-fg';
    }
    if (usage >= limit * 0.8) {
        return 'text-yellow-500';
    }
    return 'text-text-primary';
}

function getDaysUntilNextMonth() {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const diffTime = nextMonth.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Formats multiples of 1000 to k
 * @example 1000 -> 1k
 * @example 2000 -> 2k
 * @example 2025 -> 2025
 */
function formatLimit(limit: number) {
    if (limit >= 1000 && limit % 1000 === 0) {
        return `${(limit / 1000).toFixed(0)}k`;
    }
    return limit;
}

export default function UsageCard() {
    const env = useStore((state) => state.env);
    const { data: usage, isLoading } = useApiGetUsage(env);

    const usageResetMessage = useMemo(() => {
        const daysUntilNextMonth = getDaysUntilNextMonth();
        if (daysUntilNextMonth <= 1) {
            return 'Usage resets in 1 day';
        }
        return `Usage resets in ${daysUntilNextMonth} days`;
    }, []);

    return (
        <div className="flex flex-col rounded-sm bg-bg-surface border border-border-muted">
            <span className="text-text-primary font-semibold text-sm p-3 border-b border-border-muted">Free plan usage</span>
            <div className="flex flex-col gap-4 p-3 pb-4.5">
                <div className="flex flex-col gap-2.5 w-full">
                    {isLoading ? (
                        <>
                            <Skeleton className="h-[24px]" />
                            <Skeleton className="h-[24px]" />
                            <Skeleton className="h-[24px]" />
                        </>
                    ) : (
                        Object.entries(usage?.data ?? {}).map(([metric, usage]) => (
                            <div key={metric} className="flex flex-row justify-between items-center">
                                <div className="flex flex-row items-center gap-1">
                                    <span className="text-text-secondary text-s leading-5">{usage.label}</span>
                                    {metric === 'active_records' && (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <IconInfoCircle className="w-3 h-3 text-text-tertiary" />
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom" align="center">
                                                Synced records are only counted for connections that are at least 1 month old
                                            </TooltipContent>
                                        </Tooltip>
                                    )}
                                </div>
                                <div>
                                    <span className={cn('text-s font-bold', getColorForUsage(usage.usage, usage.limit))}>{usage.usage}</span>
                                    {usage.limit && <span className="text-text-tertiary text-s">/{formatLimit(usage.limit)}</span>}
                                </div>
                            </div>
                        ))
                    )}
                </div>
                <div className="flex flex-col gap-2.5 items-center">
                    <ButtonLink to={`/${env}/team/billing`} variant="secondary" className="w-full justify-center">
                        Upgrade
                    </ButtonLink>
                    <span className="text-text-secondary text-s leading-4">{usageResetMessage}</span>
                </div>
            </div>
        </div>
    );
}
