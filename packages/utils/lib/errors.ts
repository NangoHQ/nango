import { serializeError } from 'serialize-error';

export function errorToObject(err: unknown) {
    return serializeError(err);
}

export function stringifyError(err: unknown) {
    return JSON.stringify(serializeError(err));
}
