import safeStringify from 'fast-safe-stringify';

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

export function stringifyAndTruncateLog(value: any, maxSize: number = 99_000): string {
    if (value === null) {
        return 'null';
    }
    if (value === undefined) {
        return 'undefined';
    }

    let msg = typeof value === 'string' ? value : stringifyObject(value);

    if (msg && msg.length > maxSize) {
        msg = `${msg.substring(0, maxSize)}... (truncated)`;
    }

    return msg;
}
