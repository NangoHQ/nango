import parser from 'cron-parser';

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

function formatFutureRun(nextRun: number): Date | undefined {
    if (!nextRun) {
        return;
    }

    let milliseconds = Number(nextRun) * 1000;

    const date = new Date(milliseconds);

    return date;
}

export function interpretNextRun(futureRuns: number[]) {
    const [nextRun, nextNextRun] = futureRuns;
    if (!nextRun) {
        return '-';
    }

    const date = formatFutureRun(nextRun);

    if (!date) {
        return '-';
    }

    const nextDate = formatFutureRun(nextNextRun);

    const nextRuns = [date, nextDate].map(d => d && formatDateToUSFormat(d.toISOString()));

    return nextRuns;
}
