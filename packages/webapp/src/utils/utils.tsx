import parser from 'cron-parser';
import type { SyncResult } from '../types';

export const localhostUrl: string = 'http://localhost:3003';
export const stagingUrl: string = 'https://api-staging.nango.dev';
export const prodUrl: string = 'https://api.nango.dev';

export const syncDocs = 'https://docs.nango.dev/guides/sync';

export function isHosted() {
    return process.env.REACT_APP_ENV === 'hosted';
}

export function isStaging() {
    return process.env.REACT_APP_ENV === 'staging';
}

export function isProd() {
    return process.env.REACT_APP_ENV === 'production';
}

export function isCloud() {
    return isProd() || isStaging();
}

export function isLocal() {
    return window.location.href.includes('localhost');
}

export function baseUrl() {
    switch (process.env.REACT_APP_ENV) {
        case 'hosted':
            return localhostUrl;
        case 'staging':
            return stagingUrl;
        case 'production':
            return prodUrl;
        default:
            return localhostUrl;
    }
}

export function defaultCallback() {
    return baseUrl() + '/oauth/callback';
}

export function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);

    if (isNaN(date.getTime())) {
        return '';
    }

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();

    const formattedDate = `${hours}:${minutes}:${seconds} - ${month}/${day}/${year}`;

    return formattedDate;
}

export function formatTimestampWithTZ(timestamp: number): string {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
        return '';
    }

    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');

    const formattedDate = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}Z`;

    return formattedDate;
}

export function elapsedTime(start: number, end: number): string {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();

    if (isNaN(startTime) || isNaN(endTime)) {
        return '';
    }

    const elapsedTime = endTime - startTime;
    const elapsedSeconds = Math.floor(elapsedTime / 1000);
    const elapsedMilliseconds = elapsedTime % 1000;

    return `${elapsedSeconds}.${elapsedMilliseconds} seconds`;
}

export function formatDateToUSFormat(dateString: string): string {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true,
    };

    const formattedDate = date.toLocaleString('en-US', options);

    if (formattedDate === 'Invalid Date') {
        return '-';
    }
    return formattedDate;
}

export function parseCron(frequency: string): string {
    const interval = parser.parseExpression(frequency);
    return formatDateToUSFormat(interval.next().toISOString());
};

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

    const nextRuns = [date, nextDate].map(d => d && formatDateToUSFormat(d.toISOString()));

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

/**
 * Calculate Total Runtime
 * @desc iterate over each timestamp and calculate the total runtime
 * to get the total runtime for the total of array timestamps
 */
export function calculateTotalRuntime(timestamps: { created_at: string; updated_at: string}[]): string {
    let totalRuntime = 0;

    timestamps.forEach(timestamp => {
        const createdAt = new Date(timestamp.created_at);
        const updatedAt = new Date(timestamp.updated_at);

        const diffMilliseconds = updatedAt.getTime() - createdAt.getTime();

        totalRuntime += diffMilliseconds;
    });

    const seconds = Math.floor((totalRuntime / 1000) % 60);
    const minutes = Math.floor((totalRuntime / (1000 * 60)) % 60);
    const hours = Math.floor((totalRuntime / (1000 * 60 * 60)) % 24);
    const days = Math.floor(totalRuntime / (1000 * 60 * 60 * 24));

    let runtime = '';
    if (days > 0) runtime += `${days}d `;
    if (hours > 0) runtime += `${hours}h `;
    if (minutes > 0) runtime += `${minutes}m `;
    if (seconds > 0) runtime += `${seconds}s`;

    const result = runtime.trim();

    return  result === '' ? '-' : result;
};
