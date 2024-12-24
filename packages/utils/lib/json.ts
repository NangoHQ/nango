import safeStringify from 'fast-safe-stringify';
import truncateJsonPkg from 'truncate-json';
import { truncateBytes } from './string.js';

export const MAX_LOG_PAYLOAD = 99_000; // in  bytes

const ignoredKeys = ['httpAgent', 'httpsAgent', 'trace', '_sessionCache', 'stack'];
/**
 * Safely stringify an object (mostly handle circular ref and known problematic keys)
 */
export function stringifyObject(value: any): string {
    return safeStringify.stableStringify(
        value,
        (key, value) => {
            if (value instanceof Buffer) {
                return '[Buffer]';
            }
            if (key === 'Authorization') {
                return '[Redacted]';
            } else if (ignoredKeys.includes(key)) {
                return undefined;
            }
            return value;
        },
        undefined,
        { depthLimit: 10, edgesLimit: 20 }
    );
}

/**
 * Stringify and truncate unknown value
 */
export function stringifyAndTruncateValue(value: any, maxSize: number = MAX_LOG_PAYLOAD): string {
    if (value === null) {
        return 'null';
    }
    if (value === undefined) {
        return 'undefined';
    }

    const msg = typeof value === 'string' ? value : truncateJsonString(stringifyObject(value), maxSize);

    const truncated = truncateBytes(msg, maxSize);
    if (truncated !== msg) {
        return `${truncated}... (truncated)`;
    }

    return msg;
}

/**
 * Truncate a JSON
 * Will entirely remove properties that are too big
 */
export function truncateJson<TObject extends Record<string, any>>(value: TObject, maxSize: number = MAX_LOG_PAYLOAD): TObject {
    return JSON.parse(truncateJsonPkg(stringifyObject(value), maxSize).jsonString);
}

/**
 * Truncate a JSON as string
 * Will entirely remove properties that are too big
 */
export function truncateJsonString(value: string, maxSize: number = MAX_LOG_PAYLOAD): string {
    return truncateJsonPkg(value, maxSize).jsonString;
}
