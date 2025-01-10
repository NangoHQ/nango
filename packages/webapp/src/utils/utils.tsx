import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { format } from 'date-fns';
import { twMerge } from 'tailwind-merge';
import type { SyncResult } from '../types';
import { globalEnv } from './env';

export const githubRepo = 'https://github.com/NangoHQ/integration-templates';
export const githubIntegrationTemplates = `${githubRepo}/tree/main/integrations`;

export function isCloudProd() {
    return window.location.origin === 'https://app.nango.dev';
}

export function defaultCallback() {
    return globalEnv.apiUrl + '/oauth/callback';
}

export function elapsedTime(start: Date | number, end: Date | number): string {
    const startTime = start instanceof Date ? start.getTime() : new Date(start).getTime();
    const endTime = end instanceof Date ? end.getTime() : new Date(end).getTime();

    if (isNaN(startTime) || isNaN(endTime)) {
        return '';
    }

    const elapsedTime = endTime - startTime;
    const elapsedSeconds = Math.floor(elapsedTime / 1000);
    const elapsedMilliseconds = elapsedTime % 1000;

    return `${elapsedSeconds}.${elapsedMilliseconds} seconds`;
}

export function formatDateToShortUSFormat(dateString: string): string {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        month: 'short',
        day: '2-digit',
        hour12: false
    };

    const formattedDate = date.toLocaleString('en-US', options);

    if (formattedDate === 'Invalid Date') {
        return '-';
    }

    const parts = formattedDate.split(', ');
    return `${parts[1]}, ${parts[0]}`;
}

export function formatDateToUSFormat(dateString?: string): string {
    if (!dateString) {
        return '-';
    }

    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
    };

    const formattedDate = date.toLocaleString('en-US', options);

    if (formattedDate === 'Invalid Date') {
        return '-';
    }
    return formattedDate;
}
export function formatDateToInternationalFormat(dateString: string): string {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
    };

    const formattedDate = date.toLocaleString('en-US', options);

    if (formattedDate === 'Invalid Date') {
        return '-';
    }
    return formattedDate;
}

export function formatDateToLogFormat(dateString: string): string {
    const date = new Date(dateString);
    return format(date, 'MMM dd, HH:mm:ss:SS');
}

function formatFutureRun(nextRun: number): Date | undefined {
    if (!nextRun) {
        return;
    }

    const milliseconds = Number(nextRun) * 1000;

    const date = new Date(milliseconds);

    return date;
}

export function interpretNextRun(futureRuns: number[], previousRun?: string): string | string[] {
    const [nextRun, nextNextRun] = futureRuns;
    if (!nextRun) {
        return '-';
    }

    const date = formatFutureRun(nextRun);

    // if the future date is less than the previous date for some reason then return '-'
    if (previousRun) {
        const previousRunTime = new Date(previousRun);
        if (date && date < previousRunTime) {
            return '-';
        }
    }

    if (!date) {
        return '-';
    }

    const nextDate = formatFutureRun(nextNextRun);

    const nextRuns = [date, nextDate].map((d) => d && formatDateToUSFormat(d.toISOString()));

    if (previousRun) {
        const previousRunTime = new Date(previousRun);
        if (nextDate && nextDate < previousRunTime) {
            nextRuns[1] = '-';
        }
    }

    return nextRuns as string[];
}

export function parseLatestSyncResult(result: SyncResult, models: string[]) {
    if ('added' in result || 'updated' in result || 'deleted' in result) {
        return JSON.stringify(result, null, 2);
    } else if (models && models.length === 1) {
        const [singleModel] = models;
        const results = result[singleModel];
        return JSON.stringify(results, null, 2);
    } else {
        return JSON.stringify(result, null, 2);
    }
}

export function getRunTime(created_at: string, updated_at: string): string {
    if (!created_at || !updated_at) {
        return '-';
    }

    const createdAt = new Date(created_at);
    const updatedAt = new Date(updated_at);

    const diffMilliseconds = updatedAt.getTime() - createdAt.getTime();

    const milliseconds = diffMilliseconds % 1000;
    const seconds = Math.floor((diffMilliseconds / 1000) % 60);
    const minutes = Math.floor((diffMilliseconds / (1000 * 60)) % 60);
    const hours = Math.floor((diffMilliseconds / (1000 * 60 * 60)) % 24);
    const days = Math.floor(diffMilliseconds / (1000 * 60 * 60 * 24));

    let runtime = '';
    if (days > 0) runtime += `${days}d `;
    if (hours > 0) runtime += `${hours}h `;
    if (minutes > 0) runtime += `${minutes}m `;
    if (seconds > 0) runtime += `${seconds}s `;

    if (!days && !hours && !minutes && !seconds && milliseconds > 0) {
        runtime += `${milliseconds}ms`;
    }

    return runtime.trim() || '-';
}

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const quantityFormatter = Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1, minimumFractionDigits: 0 });
export function formatQuantity(quantity: number): string {
    return quantityFormatter.format(quantity);
}

const unitMap: Record<string, string> = {
    minutes: 'm',
    minute: 'm',
    mins: 'm',
    min: 'm',
    hours: 'h',
    hour: 'h',
    days: 'd',
    day: 'd',
    months: 'mos',
    month: 'mo',
    years: 'y',
    year: 'y'
};

const phraseMap: Record<string, string> = {
    'every half day': '12h',
    'every half hour': '30m',
    'every quarter hour': '15m',
    'every hour': '1h',
    'every day': '1d',
    'every month': '30d',
    'every week': '1w'
};

export function formatFrequency(frequency: string): string {
    if (phraseMap[frequency]) {
        return phraseMap[frequency];
    }

    // 1. replace every: every 5 minutes -> 5 minutes
    frequency = frequency.replace('every', '').trim();

    // 2. prefix with `1` if no quantity. Ex: every day -> day -> 1day
    if (!/^\d/.test(frequency)) {
        frequency = '1' + frequency;
    }

    // 3. replace unit by shortname if possible: Ex: 5 minutes -> 5m
    for (const [unit, abbreviation] of Object.entries(unitMap)) {
        if (frequency.includes(unit)) {
            return frequency.replace(unit, abbreviation).replace(/\s/g, '');
        }
    }

    return frequency;
}

// https://stackoverflow.com/a/42186143
export function stringArrayEqual(prev: string[], next: string[]) {
    // can't use toSorted yet
    const a = [...prev].sort();
    const b = [...next].sort();
    let i = a.length;
    while (i--) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}
