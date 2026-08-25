import { getUsageBarStyles, getUsageState } from '@/utils/usage';
import { cn } from '@/utils/utils';

interface UsageBarProps {
    usage: number;
    limit: number | null;
    className?: string;
}

/**
 * A thin progress bar of usage against a plan cap. Green under the warning band, amber when
 * nearing (≥80%), red at/over the limit. The fill is clamped to 100% so an over-limit metric
 * shows a full bar rather than overflowing.
 */
export const UsageBar: React.FC<UsageBarProps> = ({ usage, limit, className }) => {
    const state = getUsageState(usage, limit);
    const { track, fill } = getUsageBarStyles(state);
    const ratio = limit ? Math.min(usage / limit, 1) : 0;

    return (
        <div className={cn('h-1.5 w-full rounded-full overflow-hidden', track, className)}>
            <div className={cn('h-full rounded-full transition-[width]', fill)} style={{ width: `${ratio * 100}%` }} />
        </div>
    );
};
