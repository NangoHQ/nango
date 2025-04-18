import path from 'node:path';
import ms from 'ms';
import type { StringValue } from 'ms';
import type { HTTP_METHOD, NangoSyncEndpointV2, NangoYaml, NangoYamlParsed, NangoYamlParsedIntegration, NangoYamlV2Endpoint } from '@nangohq/types';

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

    if (firstProviderConfig && ('syncs' in firstProviderConfig || 'actions' in firstProviderConfig || 'on-events' in firstProviderConfig)) {
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

    if (ms(interval) < ms('30s')) {
        return new Error('sync_interval_too_short');
    }

    const offset = getOffset(interval, date);
    const response: IntervalResponse = { interval, offset };

    return response;
}

export const JAVASCRIPT_AND_TYPESCRIPT_TYPES = {
    primitives: ['string', 'number', 'boolean', 'bigint', 'symbol'],
    builtInObjects: ['Object', 'Array', 'Function', 'Date', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol', 'Error'],
    utilityTypes: ['Record', 'Partial', 'Readonly', 'Pick', 'Omit', 'Awaited', 'Required', 'Exclude', 'Extract', 'Uppercase', 'Lowercase']
};
const typesLowercase = Object.values(JAVASCRIPT_AND_TYPESCRIPT_TYPES)
    .flat()
    .map((v) => v.toLocaleLowerCase());
const typesWithGenerics = [...JAVASCRIPT_AND_TYPESCRIPT_TYPES.builtInObjects, ...JAVASCRIPT_AND_TYPESCRIPT_TYPES.utilityTypes];
// Only used externally
export function isJsOrTsType(type?: string): boolean {
    if (!type) {
        return false;
    }

    const baseType = type.replace(/\[\]$/, '').toLocaleLowerCase();
    if (typesLowercase.includes(baseType)) {
        return true;
    }

    const genericTypeRegex = new RegExp(`^(${typesWithGenerics.join('|')})<.+>$`, 'i');

    return genericTypeRegex.test(baseType);
}

export const typesAliases: Record<string, string> = {
    integer: 'number',
    int: 'number',
    char: 'string',
    varchar: 'string',
    float: 'number',
    bool: 'boolean',
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    bigint: 'bigint',
    date: 'Date',
    object: 'Record<string, any>',
    any: 'any',
    array: 'any[]',
    undefined: 'undefined'
};

export function getPotentialTypeAlias(value: string): string | undefined {
    return typesAliases[value.toLocaleLowerCase()];
}

export function getNativeDataType(value: string): number | boolean | null | 'undefined' | Error {
    const int = parseInt(value, 10);
    if (!Number.isNaN(int)) {
        return int;
    }

    switch (value.toLocaleLowerCase()) {
        case 'true':
            return true;
        case 'false':
            return false;
        case 'null':
            return null;
        case 'undefined':
            return 'undefined';
        default:
            return new Error();
    }
}

export function isDisallowedType(value: string) {
    return typesWithGenerics.some((type) => value.startsWith(`${type}<`));
}

const regQuote = /^[a-zA-Z0-9_]+$/;
export function shouldQuote(name: string) {
    return !regQuote.test(name);
}

export function getProviderConfigurationFromPath({ filePath, parsed }: { filePath: string; parsed: NangoYamlParsed }): NangoYamlParsedIntegration | null {
    const pathSegments = filePath.split(path.sep);
    const scriptType = pathSegments.length > 1 ? pathSegments[pathSegments.length - 2] : null;
    const isNested = scriptType && ['syncs', 'actions', 'post-connection-scripts', 'on-events'].includes(scriptType);

    const baseName = path.basename(filePath, '.ts');
    let providerConfiguration: NangoYamlParsedIntegration | null = null;
    if (isNested) {
        const providerConfigKey = pathSegments[pathSegments.length - 3];
        providerConfiguration = parsed.integrations.find((config) => config.providerConfigKey === providerConfigKey) || null;
    } else {
        providerConfiguration = parsed.integrations.find((config) => [...config.syncs, ...config.actions].find((sync) => sync.name === baseName)) || null;
    }

    return providerConfiguration;
}

export function parseEndpoint(rawEndpoint: string | NangoSyncEndpointV2 | NangoYamlV2Endpoint, defaultMethod: HTTP_METHOD): NangoSyncEndpointV2 {
    if (typeof rawEndpoint === 'string') {
        const endpoint = rawEndpoint.split(' ');
        if (endpoint.length > 1) {
            return { method: endpoint[0] as HTTP_METHOD, path: endpoint[1] as string };
        }

        return { method: defaultMethod, path: endpoint[0] as string };
    }

    return { method: rawEndpoint.method || defaultMethod, path: rawEndpoint.path, group: rawEndpoint.group };
}
