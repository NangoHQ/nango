import safeStringify from 'fast-safe-stringify';

export function stringifyAndTruncateLog(value: any, maxSize: number = 99_000): string {
    if (value === null) {
        return 'null';
    }
    if (value === undefined) {
        return 'undefined';
    }

    let msg = typeof value === 'string' ? value : safeStringify.stableStringify(value, undefined, undefined, { depthLimit: 10, edgesLimit: 20 });

    if (msg && msg.length > maxSize) {
        msg = `${msg.substring(0, maxSize)}... (truncated)`;
    }

    return msg;
}
