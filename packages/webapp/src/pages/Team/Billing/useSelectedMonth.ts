import { parseAsString, useQueryState } from 'nuqs';
import { useMemo } from 'react';

import { useTeam } from '@/hooks/useTeam';
import { useStore } from '@/store';
import { usageMonthFloorMs, usageMonthFloorReason } from './usageMonthFloor';

import type { UsageMonthFloorReason } from './usageMonthFloor';

// Parser for month in YYYY-MM format, shared across the page header and the per-metric drill-in
// steppers so they all read/write the same `?month` param and stay in sync.
const parseMonth = parseAsString.withDefault('').withOptions({ history: 'replace' });

interface UseSelectedMonth {
    selectedMonth: Date;
    setSelectedMonth: (date: Date) => void;
    /** False once at the current month (no future navigation). */
    canGoNext: boolean;
    isCurrentMonth: boolean;
    canGoPrevious: boolean;
    earliestMonth: Date;
    earliestMonthReason: UsageMonthFloorReason;
}

export function useSelectedMonth(): UseSelectedMonth {
    const [monthParam, setMonthParam] = useQueryState('month', parseMonth);
    const env = useStore((state) => state.env);
    const { data: teamData } = useTeam(env);

    const accountCreatedAt = teamData?.data.account.created_at;
    const earliestMonthMs = useMemo(() => usageMonthFloorMs(accountCreatedAt), [accountCreatedAt]);

    const selectedMonth = useMemo(() => {
        const now = new Date();
        const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        let month = currentMonth;
        // Strict YYYY-MM so a malformed deep link can't build an invalid Date (which throws on toISOString).
        const match = /^(\d{4})-(\d{2})$/.exec(monthParam);
        if (match) {
            const m = Number(match[2]);
            if (m >= 1 && m <= 12) {
                const parsed = new Date(Date.UTC(Number(match[1]), m - 1, 1));
                // Clamp future deep links to the current month — usage never has a future period.
                month = parsed > currentMonth ? currentMonth : parsed;
            }
        }
        return month.getTime() < earliestMonthMs ? new Date(earliestMonthMs) : month;
    }, [monthParam, earliestMonthMs]);

    const setSelectedMonth = (date: Date) => {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        void setMonthParam(`${year}-${month}`);
    };

    const canGoNext = useMemo(() => {
        const now = new Date();
        const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        return selectedMonth < currentMonth;
    }, [selectedMonth]);

    // Until the team loads, the floor is the loose June default. Without this guard the arrow enables and the month snaps back.
    const canGoPrevious = Boolean(accountCreatedAt) && selectedMonth.getTime() > earliestMonthMs;

    return {
        selectedMonth,
        setSelectedMonth,
        canGoNext,
        canGoPrevious,
        isCurrentMonth: !canGoNext,
        earliestMonth: new Date(earliestMonthMs),
        earliestMonthReason: usageMonthFloorReason(earliestMonthMs)
    };
}
