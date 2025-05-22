import { addMilliseconds, startOfDay, subDays, subHours, subMinutes } from 'date-fns';

import type { Period, PeriodPreset } from './dates';
import type { SearchOperations, SearchPeriod } from '@nangohq/types';

export function getLogsUrl(
    options: Omit<
        Partial<{
            [P in keyof SearchOperations['Body']]?: string | undefined;
        }>,
        'period'
    > & { operationId?: string | null | number; env: string; day?: Date | null }
): string {
    const usp = new URLSearchParams();
    for (const [key, val] of Object.entries(options)) {
        if (!val || key === 'env') {
            continue;
        }
        if (key === 'day' && val) {
            const from = new Date(val);
            from.setHours(0, 0);
            const to = new Date(val);
            to.setHours(23, 59);
            usp.set('from', from.toISOString());
            usp.set('to', to.toISOString());
            continue;
        }
        usp.set(key, val as any);
    }

    usp.set('live', 'false');
    usp.sort();
    return `/${options.env}/logs?${usp.toString()}`;
}

export function slidePeriod(period: Period | SearchPeriod): Period {
    const now = new Date();
    let from = new Date(period.from);
    let to = new Date(period.to ?? now);
    const sliding = now.getTime() - to.getTime();
    to = addMilliseconds(to, sliding);
    from = addMilliseconds(from, sliding);

    return { from, to };
}

export const last24hPreset: PeriodPreset = {
    name: 'last24h',
    label: 'Last 24 hours',
    shortLabel: '24h',
    toPeriod: () => ({
        from: subDays(new Date(), 1)
    })
};

// Define presets
export const logsPresets: PeriodPreset[] = [
    {
        name: 'last5m',
        label: 'Last 5 minutes',
        shortLabel: '5m',
        toPeriod: () => ({
            from: subMinutes(new Date(), 5)
        })
    },
    {
        name: 'last1h',
        label: 'Last hour',
        shortLabel: '1h',
        toPeriod: () => ({
            from: subHours(new Date(), 1)
        })
    },
    last24hPreset,
    {
        name: 'last3d',
        label: 'Last 3 days',
        shortLabel: '3d',
        toPeriod: () => ({
            from: startOfDay(subDays(new Date(), 3))
        })
    },
    {
        name: 'last7d',
        label: 'Last 7 days',
        shortLabel: '1w',
        toPeriod: () => ({
            from: startOfDay(subDays(new Date(), 7))
        })
    },
    {
        name: 'last14d',
        label: 'Last 14 days',
        shortLabel: '2w',
        toPeriod: () => ({
            from: startOfDay(subDays(new Date(), 14))
        })
    }
] as const;
