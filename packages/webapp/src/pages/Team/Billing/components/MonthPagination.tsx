import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useMemo } from 'react';

import { IconButton } from '@nangohq/design-system';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { EARLIEST_USAGE_MONTH_MS } from '../usageBreakdown';
import { useSelectedMonth } from '../useSelectedMonth';

const EARLIEST_USAGE_MONTH_LABEL = new Date(EARLIEST_USAGE_MONTH_MS).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Month stepper for the in-chart drill-in (the design's "Pagination"): arrow buttons flanking the
 * month label, sitting to the right of the Group/Filter controls. Backed by the shared `?month`
 * param, so it stays in sync with anything else reading `useSelectedMonth`.
 */
export const MonthPagination: React.FC = () => {
    const { selectedMonth, setSelectedMonth, canGoNext, canGoPrevious } = useSelectedMonth();

    const monthDisplay = useMemo(() => selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }), [selectedMonth]);

    const handlePrevious = () => {
        const next = new Date(selectedMonth);
        next.setUTCMonth(selectedMonth.getUTCMonth() - 1);
        setSelectedMonth(next);
    };
    const handleNext = () => {
        const next = new Date(selectedMonth);
        next.setUTCMonth(selectedMonth.getUTCMonth() + 1);
        setSelectedMonth(next);
    };

    const previousButton = (
        <IconButton variant="ghost" size="2xs" onClick={handlePrevious} disabled={!canGoPrevious} label="Previous month">
            <ArrowLeft />
        </IconButton>
    );

    return (
        <div className="flex items-center">
            {canGoPrevious ? (
                previousButton
            ) : (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="inline-flex" tabIndex={0}>
                            {previousButton}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>Usage tracking is only available from {EARLIEST_USAGE_MONTH_LABEL}.</TooltipContent>
                </Tooltip>
            )}
            <span className="text-text-secondary text-body-small-regular px-1 whitespace-nowrap">{monthDisplay}</span>
            <IconButton variant="ghost" size="2xs" onClick={handleNext} disabled={!canGoNext} label="Next month">
                <ArrowRight />
            </IconButton>
        </div>
    );
};
