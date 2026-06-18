import { serializeError } from 'serialize-error';

import type { ErrorObject } from 'serialize-error';

/**
 * Transform any Error or primitive to a json-serializable object for structured logging.
 */
export function errorToObject(err: unknown): ErrorObject {
    if (err == null) {
        return { message: 'Unknown error' };
    }

    if (typeof err === 'string' || typeof err === 'number' || typeof err === 'boolean') {
        return { message: String(err) };
    }

    return serializeError(err, { maxDepth: 5 });
}
