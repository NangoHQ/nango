import { format, isSameDay } from 'date-fns';

import { millisecondsToRuntime } from '../../utils/utils';

export function formatOperationTime(createdAt: string, now: Date): string {
    const date = new Date(createdAt);
    return format(date, isSameDay(date, now) ? 'HH:mm:ss' : 'MMM d HH:mm:ss');
}

export function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${Math.round(ms)}ms`;
    }
    if (ms < 60_000) {
        return `${(Math.floor(ms / 100) / 10).toFixed(1)}s`;
    }
    return millisecondsToRuntime(ms - (ms % 1000));
}
