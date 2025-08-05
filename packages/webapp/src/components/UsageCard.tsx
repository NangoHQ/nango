import { useMemo } from 'react';

import { useApiGetUsage } from '../hooks/usePlan.js';
import { useStore } from '../store.js';
import { Skeleton } from './ui/Skeleton.js';
import { cn } from '../utils/utils.js';
import { ButtonLink } from './ui/button/Button.js';

function getColorForUsage(usage: number, limit: number | null) {
    if (!limit) {
        return 'text-text-secondary';
    }
    if (usage >= limit) {
        return 'text-alert-4';
    }
    if (usage >= limit * 0.8) {
        return 'text-warning-4';
    }
    return 'text-text-secondary';
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
        <div className="flex flex-col gap-[20px] p-3 rounded">
            <span className="text-white font-semibold text-sm">Free plan usage</span>
            <div className="flex flex-col gap-[10px]">
                <div className="flex flex-col gap-[10px] w-full">
                    {isLoading ? (
                        <>
                            <Skeleton className="h-[24px]" />
                            <Skeleton className="h-[24px]" />
                            <Skeleton className="h-[24px]" />
                        </>
                    ) : (
                        Object.entries(usage?.data ?? {}).map(([metric, usage]) => (
                            <div key={metric} className="flex flex-row justify-between items-center">
                                <span className="text-text-secondary text-s">{usage.label}</span>
                                <div>
                                    <span className={cn('text-s', getColorForUsage(usage.usage, usage.limit))}>{usage.usage}</span>
                                    {usage.limit && <span className="text-text-tertiary text-s">/{formatLimit(usage.limit)}</span>}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
            <div className="flex flex-col gap-[10px] items-center">
                <ButtonLink to={`/${env}/team/billing`} variant="secondary" className="w-full justify-center">
                    Upgrade
                </ButtonLink>
                <span className="text-text-tertiary text-s">{usageResetMessage}</span>
            </div>
        </div>
    );
}
