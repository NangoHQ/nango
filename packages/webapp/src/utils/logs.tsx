import { addMilliseconds, parse } from 'date-fns';

import type { SearchOperations, SearchOperationsPeriod } from '@nangohq/types';

export interface DateRange {
    from: Date;
    to?: Date;
}

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

export function slidePeriod(period: DateRange | SearchOperationsPeriod): DateRange {
    const now = new Date();
    let from = new Date(period.from);
    let to = new Date(period.to!);
    const sliding = now.getTime() - to.getTime();
    to = addMilliseconds(to, sliding);
    from = addMilliseconds(from, sliding);

    return { from, to };
}

// Define presets
export const presets = [
    { name: 'last5m', label: 'Last 5 minutes', shortLabel: '5m' },
    { name: 'last1h', label: 'Last hour', shortLabel: '1h' },
    { name: 'last24h', label: 'Last 24 hours', shortLabel: '24h' },
    { name: 'last3d', label: 'Last 3 days', shortLabel: '3d' },
    { name: 'last7d', label: 'Last 7 days', shortLabel: '1w' },
    { name: 'last14d', label: 'Last 14 days', shortLabel: '2w' }
] as const;
export type PresetNames = (typeof presets)[number]['name'];
export type Preset = (typeof presets)[number];

export function getPresetRange(preset: PresetNames): DateRange {
    const from = new Date();
    const to = new Date();

    switch (preset) {
        case 'last5m':
            from.setMinutes(from.getMinutes() - 5);
            break;
        case 'last1h':
            from.setMinutes(from.getMinutes() - 60);
            break;
        case 'last24h':
            from.setDate(from.getDate() - 1);
            break;
        case 'last3d':
            from.setDate(from.getDate() - 2);
            from.setHours(0, 0, 0, 0);
            to.setHours(23, 59, 59, 999);
            break;
        case 'last7d':
            from.setDate(from.getDate() - 6);
            from.setHours(0, 0, 0, 0);
            to.setHours(23, 59, 59, 999);
            break;
        case 'last14d':
            from.setDate(from.getDate() - 13);
            from.setHours(0, 0, 0, 0);
            to.setHours(23, 59, 59, 999);
            break;
    }

    return { from, to };
}

export function matchPresetFromRange(range: DateRange): Preset | null {
    const minutes = (range.to!.getTime() - range.from.getTime()) / 1000 / 60;
    for (const preset of presets) {
        const tmp = getPresetRange(preset.name);
        const tmpMinutes = (tmp.to!.getTime() - tmp.from.getTime()) / 1000 / 60;
        if (tmpMinutes === minutes) {
            return preset;
        }
    }

    return null;
}

export function parseDateRange(input: string, dateTimeFormat: string, example: string): { dateRange: DateRange | null; error: string | null } {
    // Validate input format
    const dateFormatRegex = /^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} - [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}$/;
    if (!dateFormatRegex.test(input)) {
        return { dateRange: null, error: `Invalid format. Example: ${example}` };
    }

    const [from, to] = input.split('-').map((d) => d.trim());

    const range = {
        from: parse(from, dateTimeFormat, new Date()),
        to: parse(to, dateTimeFormat, new Date())
    };

    if (isNaN(range.from.getTime()) || isNaN(range.to.getTime())) {
        return { dateRange: null, error: `Invalid date. Example: ${example}` };
    }

    if (range.from > range.to) {
        return { dateRange: null, error: "'from' date must be before 'to' date" };
    }

    return { dateRange: range, error: null };
}
