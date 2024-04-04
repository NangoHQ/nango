import { serializeError } from 'serialize-error';

/**
 * Transform any Error or primitive to a json object
 */
export function errorToObject(err: unknown) {
    return serializeError(err);
}

/**
 * Transform any Error or primitive to a string
 */
export function stringifyError(err: unknown) {
    return JSON.stringify(serializeError(err));
}
