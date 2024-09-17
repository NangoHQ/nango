import safeStringify from 'fast-safe-stringify';
import truncateJsonPkg from 'truncate-json';

export const MAX_LOG_PAYLOAD = 99_000; // in  bytes

/**
 * Safely stringify an object (mostly handle circular ref and known problematic keys)
 */
export function stringifyObject(value: any): string {
    return safeStringify.stableStringify(
        value,
        (key, value) => {
            if (value instanceof Buffer || key === '_sessionCache') {
                return '[Buffer]';
            }
            if (key === 'Authorization') {
                return '[Redacted]';
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

    let msg = typeof value === 'string' ? value : truncateJsonString(stringifyObject(value), maxSize);

    if (msg && msg.length > MAX_LOG_PAYLOAD) {
        msg = `${msg.substring(0, MAX_LOG_PAYLOAD)}... (truncated)`;
    }

    return msg;
}

/**
 * Truncate a JSON
 * Will entirely remove properties that are too big
 */
export function truncateJson(value: Record<string, any>, maxSize: number = MAX_LOG_PAYLOAD) {
    return JSON.parse(truncateJsonPkg(JSON.stringify(value), maxSize).jsonString);
}

/**
 * Truncate a JSON as string
 * Will entirely remove properties that are too big
 */
export function truncateJsonString(value: string, maxSize: number = MAX_LOG_PAYLOAD): string {
    return truncateJsonPkg(value, maxSize).jsonString;
}
