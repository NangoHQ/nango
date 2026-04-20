import { addMilliseconds, startOfDay, subDays, subHours, subMinutes } from 'date-fns';

import type { Period, PeriodPreset } from './dates';
import type { SearchOperations, SearchPeriod } from '@nangohq/types';

type LogsUrlOptions = Omit<
    Partial<{
        [P in keyof SearchOperations['Body']]?: string | undefined;
    }>,
    'period'
> & { operationId?: string | null | number; env: string; day?: Date | null; live?: boolean };

function setParam(usp: URLSearchParams, key: string, value: string | number | string[] | undefined | null): void {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
        const filtered = value.filter((v) => v !== '');
        if (filtered.length > 0) usp.set(key, filtered.join(','));
    } else {
        usp.set(key, String(value));
    }
}

export function getLogsUrl(options: LogsUrlOptions): string {
    const usp = new URLSearchParams();

    if (options.day) {
        const from = new Date(options.day);
        from.setHours(0, 0);
        const to = new Date(options.day);
        to.setHours(23, 59);
        usp.set('period', `${from.getTime()},${to.getTime()}`);
    }

    setParam(usp, 'operationId', options.operationId != null ? String(options.operationId) : undefined);
    setParam(usp, 'search', options.search);
    setParam(usp, 'limit', options.limit);
    setParam(usp, 'states', options.states);
    setParam(usp, 'types', options.types);
    setParam(usp, 'integrations', options.integrations);
    setParam(usp, 'connections', options.connections);
    setParam(usp, 'syncs', options.syncs);
    setParam(usp, 'cursor', options.cursor ?? undefined);

    usp.set('live', options.live ? 'true' : 'false');
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
