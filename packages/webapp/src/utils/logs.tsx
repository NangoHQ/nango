import type { SearchOperations, SearchOperationsPeriod } from '@nangohq/types';
import { addMilliseconds } from 'date-fns';
import type { DateRange } from 'react-day-picker';

export function getLogsUrl(
    options: Omit<
        Partial<{
            [P in keyof SearchOperations['Body']]?: string | undefined;
        }>,
        'period'
    > & { operationId?: string | null | number; env: string; day?: Date }
): string {
    const usp = new URLSearchParams();
    for (const [key, val] of Object.entries(options)) {
        if (!val || key === 'env') {
            continue;
        }
        if (key === 'day') {
            const from = new Date();
            from.setHours(0, 0);
            const to = new Date();
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
    let from = new Date(period.from!);
    let to = new Date(period.to!);
    const sliding = now.getTime() - to.getTime();
    to = addMilliseconds(to, sliding);
    from = addMilliseconds(from, sliding);

    return { from, to };
}

// Define presets
export const presets = [
    { name: 'last5m', label: 'Last 5 minutes' },
    { name: 'last1h', label: 'Last hour' },
    { name: 'last24h', label: 'Last 24 hours' },
    { name: 'last3', label: 'Last 3 days' },
    { name: 'last7', label: 'Last 7 days' },
    { name: 'last14', label: 'Last 14 days' }
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
        case 'last3':
            from.setDate(from.getDate() - 2);
            from.setHours(0, 0, 0, 0);
            to.setHours(23, 59, 59, 999);
            break;
        case 'last7':
            from.setDate(from.getDate() - 6);
            from.setHours(0, 0, 0, 0);
            to.setHours(23, 59, 59, 999);
            break;
        case 'last14':
            from.setDate(from.getDate() - 13);
            from.setHours(0, 0, 0, 0);
            to.setHours(23, 59, 59, 999);
            break;
    }

    return { from, to };
}

export function matchPresetFromRange(range: DateRange): Preset | null {
    const minutes = (range.to!.getTime() - range.from!.getTime()) / 1000 / 60;
    for (const preset of presets) {
        const tmp = getPresetRange(preset.name);
        const tmpMinutes = (tmp.to!.getTime() - tmp.from!.getTime()) / 1000 / 60;
        if (tmpMinutes === minutes) {
            return preset;
        }
    }

    return null;
}
