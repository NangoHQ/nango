import { ChevronLeft, ChevronRight } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo } from 'react';

import { Button } from '@/components-v2/ui/button';

// Parser for month in YYYY-MM format
const parseMonth = parseAsString.withDefault('').withOptions({ history: 'replace' });

interface MonthSelectorProps {
    onMonthChange?: (month: Date) => void;
}

export const MonthSelector: React.FC<MonthSelectorProps> = ({ onMonthChange }) => {
    // Sync selected month with URL query params
    const [monthParam, setMonthParam] = useQueryState('month', parseMonth);

    // Convert URL param to Date, defaulting to current month
    const selectedMonth = useMemo(() => {
        if (!monthParam) {
            const now = new Date();
            return new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
        }
        const [year, month] = monthParam.split('-').map(Number);
        if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
            const now = new Date();
            return new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
        }
        return new Date(year, month - 1, 1, 0, 0, 0, 0);
    }, [monthParam]);

    // Notify parent when month changes
    useEffect(() => {
        onMonthChange?.(selectedMonth);
    }, [selectedMonth, onMonthChange]);

    // Update URL param when month changes
    const setSelectedMonth = (date: Date) => {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        void setMonthParam(`${year}-${month}`);
    };

    const monthDisplay = useMemo(() => {
        return selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }, [selectedMonth]);

    const handlePreviousMonth = () => {
        const newDate = new Date(selectedMonth);
        newDate.setUTCMonth(selectedMonth.getUTCMonth() - 1);
        setSelectedMonth(newDate);
    };

    const handleNextMonth = () => {
        const newDate = new Date(selectedMonth);
        newDate.setUTCMonth(selectedMonth.getUTCMonth() + 1);
        setSelectedMonth(newDate);
    };

    // Disable next button if trying to go to future months
    const canGoNext = useMemo(() => {
        const now = new Date();
        const currentMonth = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
        return selectedMonth < currentMonth;
    }, [selectedMonth]);

    return (
        <div className="self-end flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handlePreviousMonth}>
                <ChevronLeft />
            </Button>
            <span className="text-text-primary text-body-medium-medium min-w-28 text-center">{monthDisplay}</span>
            <Button variant="ghost" size="icon" onClick={handleNextMonth} disabled={!canGoNext}>
                <ChevronRight />
            </Button>
        </div>
    );
};
