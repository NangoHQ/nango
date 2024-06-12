import ms from 'ms';
import type { StringValue } from 'ms';
import type { NangoYaml } from '@nangohq/types';

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
export function getInterval(runs: string, date: Date): IntervalResponse | Error {
    if (runs === 'every half day') {
        const response: IntervalResponse = { interval: '12h', offset: getOffset('12h', date) };
        return response;
    }

    if (runs === 'every half hour') {
        const response: IntervalResponse = { interval: '30m', offset: getOffset('30m', date) };
        return response;
    }

    if (runs === 'every quarter hour') {
        const response: IntervalResponse = { interval: '15m', offset: getOffset('15m', date) };
        return response;
    }

    if (runs === 'every hour') {
        const response: IntervalResponse = { interval: '1h', offset: getOffset('1h', date) };
        return response;
    }

    if (runs === 'every day') {
        const response: IntervalResponse = { interval: '1d', offset: getOffset('1d', date) };
        return response;
    }

    if (runs === 'every month') {
        const response: IntervalResponse = { interval: '30d', offset: getOffset('30d', date) };
        return response;
    }

    if (runs === 'every week') {
        const response: IntervalResponse = { interval: '1w', offset: getOffset('1w', date) };
        return response;
    }

    const interval = runs.replace('every ', '') as StringValue;

    if (!ms(interval)) {
        return new Error('sync_interval_invalid');
    }

    if (ms(interval) < ms('5m')) {
        return new Error('sync_interval_too_short');
    }

    const offset = getOffset(interval, date);
    const response: IntervalResponse = { interval, offset };

    return response;
}

export const JAVASCRIPT_AND_TYPESCRIPT_TYPES = {
    primitives: ['string', 'number', 'boolean', 'bigint', 'symbol', 'undefined', 'null'],
    aliases: ['String', 'Number', 'Boolean', 'BigInt', 'Symbol', 'Undefined', 'Null', 'bool', 'char', 'integer', 'int', 'date', 'object'],
    builtInObjects: ['Object', 'Array', 'Function', 'Date', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol', 'Error'],
    utilityTypes: ['Record', 'Partial', 'Readonly', 'Pick']
};

export function isJsOrTsType(type?: string): boolean {
    if (!type) {
        return false;
    }

    const baseType = type.replace(/\[\]$/, '');

    const simpleTypes = Object.values(JAVASCRIPT_AND_TYPESCRIPT_TYPES).flat();
    if (simpleTypes.includes(baseType)) {
        return true;
    }

    const typesWithGenerics = [...JAVASCRIPT_AND_TYPESCRIPT_TYPES.builtInObjects, ...JAVASCRIPT_AND_TYPESCRIPT_TYPES.utilityTypes];
    const genericTypeRegex = new RegExp(`^(${typesWithGenerics.join('|')})<.+>$`);

    return genericTypeRegex.test(baseType);
}
