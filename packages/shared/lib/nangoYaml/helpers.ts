import ms from 'ms';
import type { StringValue } from 'ms';
import type { NangoYaml } from '@nangohq/types';
import { NangoError } from '../utils/error.js';
import type { ServiceResponse } from '../models/Generic.js';

interface IntervalResponse {
    interval: StringValue;
    offset: number;
}

export function determineVersion(configData: NangoYaml): 'v1' | 'v2' {
    if (!configData.integrations) {
        return 'v1';
    }

    const keys = Object.keys(configData.integrations);
    if (keys.length <= 0) {
        // Actually not possible to know
        return 'v1';
    }

    const firstProviderConfig = configData.integrations[keys[0]!];

    if (firstProviderConfig && ('syncs' in firstProviderConfig || 'actions' in firstProviderConfig)) {
        return 'v2';
    } else {
        return 'v1';
    }
}

export function getOffset(interval: StringValue, date: Date): number {
    const intervalMilliseconds = ms(interval);

    const nowMilliseconds = date.getMinutes() * 60 * 1000 + date.getSeconds() * 1000 + date.getMilliseconds();

    const offset = nowMilliseconds % intervalMilliseconds;

    if (isNaN(offset)) {
        return 0;
    }

    return offset;
}

/**
 * Get Interval
 * @desc get the interval based on the runs property in the yaml. The offset
 * should be the amount of time that the interval should be offset by.
 * If the time is 1536 and the interval is 30m then the next time the sync should run is 1606
 * and then 1636 etc. The offset should be based on the interval and should never be
 * greater than the interval
 */
export function getInterval(runs: string, date: Date): ServiceResponse<IntervalResponse> {
    if (runs === 'every half day') {
        const response: IntervalResponse = { interval: '12h', offset: getOffset('12h', date) };
        return { success: true, error: null, response };
    }

    if (runs === 'every half hour') {
        const response: IntervalResponse = { interval: '30m', offset: getOffset('30m', date) };
        return { success: true, error: null, response };
    }

    if (runs === 'every quarter hour') {
        const response: IntervalResponse = { interval: '15m', offset: getOffset('15m', date) };
        return { success: true, error: null, response };
    }

    if (runs === 'every hour') {
        const response: IntervalResponse = { interval: '1h', offset: getOffset('1h', date) };
        return { success: true, error: null, response };
    }

    if (runs === 'every day') {
        const response: IntervalResponse = { interval: '1d', offset: getOffset('1d', date) };
        return { success: true, error: null, response };
    }

    if (runs === 'every month') {
        const response: IntervalResponse = { interval: '30d', offset: getOffset('30d', date) };
        return { success: true, error: null, response };
    }

    if (runs === 'every week') {
        const response: IntervalResponse = { interval: '1w', offset: getOffset('1w', date) };
        return { success: true, error: null, response };
    }

    const interval = runs.replace('every ', '') as StringValue;

    if (!ms(interval)) {
        const error = new NangoError('sync_interval_invalid');
        return { success: false, error, response: null };
    }

    if (ms(interval) < ms('5m')) {
        const error = new NangoError('sync_interval_too_short');
        return { success: false, error, response: null };
    }

    const offset = getOffset(interval, date);
    const response: IntervalResponse = { interval, offset };

    return { success: true, error: null, response };
}
