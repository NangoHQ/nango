import { serializeError } from 'serialize-error';

/**
 * Transform any Error or primitive to a json object
 */
export function errorToObject(err: unknown) {
    return serializeError(err, { maxDepth: 5 });
}

/**
 * Transform any Error or primitive to a string
 */
export function stringifyError(err: unknown, opts?: { pretty?: boolean; stack?: boolean }) {
    return JSON.stringify(serializeError(err), ['name', 'message', ...(opts?.stack ? ['stack', 'cause'] : [])], opts?.pretty ? 2 : undefined);
}
