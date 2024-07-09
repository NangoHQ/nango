import safeStringify from 'fast-safe-stringify';

export function stringifyAndTruncateLog(args: any[], maxSize: number = 99_000) {
    let msg = '';

    if (typeof args[0] === 'string') {
        msg = args.shift();
    }

    if (args.length > 0) {
        msg += ` ${args.map((arg) => safeStringify.stableStringify(arg, undefined, undefined, { depthLimit: 10, edgesLimit: 20 }))}`;
    }

    if (msg.length > maxSize) {
        msg = `${msg.substring(0, maxSize)}... (truncated)`;
    }

    return msg;
}
