import parser from 'cron-parser';
import ms from 'ms';

export const localhostUrl: string = 'http://localhost:3003';
export const stagingUrl: string = 'https://api-staging.nango.dev';
export const prodUrl: string = 'https://api.nango.dev';

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

    return formattedDate;
}

export function parseCron(frequency: string): string {
    const interval = parser.parseExpression(frequency);
    return formatDateToUSFormat(interval.next().toISOString());
};

/**
 * Compute Next Run
 * @desc given the start time, the interval and the offset, generate an array of
 * all intervals and figure out where the next run is
 */
export function computeNextRun(startTime: Date, interval: string, offset: number): string {
    const intervals = getIntervals(startTime, interval, offset);

    const now = new Date();
    const index = intervals.findIndex(number => now.getTime() <= number);
    const nextRunTimeInMs = intervals[index];
    const nextRunTime = new Date(nextRunTimeInMs);

    return formatDateToUSFormat(nextRunTime.toISOString());
}

// TODO fix this, for a sync every 24 hours
export function getIntervals(startOfDay: Date, interval: string, offset: number): number[] {
    const msInterval = ms(interval);
    startOfDay.setHours(0, 0, 0, 0);

    const intervals = [];
    let start = offset;

    while (start < 86400000 * 365) {
        const currentTimestamp = startOfDay.getTime() + start;

        intervals.push(currentTimestamp);
        start += msInterval;
    }

    return intervals;
}

