import { serializeError } from 'serialize-error';

import { errorToObject } from './errorSerialize.js';
import { getLogger } from './logger.js';

export { errorToObject } from './errorSerialize.js';

const PROVIDER_ERROR_MESSAGE_FIELDS = ['message', 'error', 'error_description', 'error_message', 'detail', 'details', 'reason', 'description'];

/**
 * Transform any Error or primitive to a string
 */
export function stringifyError(err: unknown, opts?: { pretty?: boolean; stack?: boolean; cause?: boolean }): string {
    const serialized = serializeError(err);
    const allowedErrorProperties = ['name', 'message', 'provider_error_payload', ...(opts?.stack ? ['stack'] : []), ...(opts?.cause ? ['cause'] : [])];

    const enriched: Record<string, unknown> = {
        ...(serialized && typeof serialized === 'object' ? serialized : {})
    };

    if (typeof err === 'object' && err != null) {
        const anyErr = err as any;

        // handle axios response data - extract whitelisted fields from response.data
        if (anyErr.response?.data) {
            const responseData = anyErr.response.data;

            // mip returns errors as string, i.e in a sentence format
            if (typeof responseData === 'string') {
                enriched['provider_error_payload'] = responseData;
            } else if (typeof responseData === 'object' && responseData !== null) {
                const filteredError: Record<string, unknown> = {};

                if (responseData.error && typeof responseData.error === 'object') {
                    for (const field of PROVIDER_ERROR_MESSAGE_FIELDS) {
                        if (field in responseData.error) {
                            const value = (responseData.error as Record<string, unknown>)[field];
                            if (typeof value !== 'object' || value === null) {
                                filteredError[field] = value;
                            }
                        }
                    }
                }
                // check top-level responseData for primitive whitelisted fields (overrides nested)
                for (const field of PROVIDER_ERROR_MESSAGE_FIELDS) {
                    if (!(field in responseData)) {
                        continue;
                    }
                    const value = (responseData as Record<string, unknown>)[field];
                    if (typeof value !== 'object' || value === null) {
                        filteredError[field] = value;
                    }
                }
                // Only set provider_error_payload if we found whitelisted fields
                if (Object.keys(filteredError).length > 0) {
                    enriched['provider_error_payload'] = filteredError;
                }
            }
        }

        // handle Boom-style error objects
        if (!enriched['provider_error_payload']) {
            const payload = anyErr.data?.payload;
            if (payload && typeof payload === 'object') {
                enriched['provider_error_payload'] = payload;
            }
        }
    }
    const filtered: Record<string, unknown> = Object.fromEntries(Object.entries(enriched).filter(([key]) => allowedErrorProperties.includes(key)));
    return JSON.stringify(filtered, null, opts?.pretty ? 2 : undefined);
}

const logger = getLogger('err');
export function report(err: unknown, extra?: Record<string, unknown>) {
    const message = errorToObject(err).message || 'Unknown error';
    logger.error(message, { err, ...extra });
}
