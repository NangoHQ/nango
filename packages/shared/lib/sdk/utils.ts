import safeStringify from 'fast-safe-stringify';
import truncateJson from 'truncate-json';

export const MAX_LOG_PAYLOAD = 99_000; // in  bytes

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

export function stringifyAndTruncateMessage(value: any, maxSize: number = MAX_LOG_PAYLOAD): string {
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

export function truncateJsonString(value: string, maxSize: number = MAX_LOG_PAYLOAD): string {
    return truncateJson(value, maxSize).jsonString;
}
