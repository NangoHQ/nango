import * as Sentry from '@sentry/node';
import { serializeError } from 'serialize-error';

import { getLogger } from './logger.js';
import { NANGO_VERSION } from './version.js';

import type { ErrorObject } from 'serialize-error';

const PROVIDER_ERROR_MESSAGE_FIELDS = ['message', 'error', 'error_description', 'error_message', 'detail', 'details', 'reason', 'description'];

/**
 * Transform any Error or primitive to a json object
 */
export function errorToObject(err: unknown): ErrorObject {
    if (!err) {
        return { message: 'Unknown error' };
    }

    if (typeof err === 'string' || typeof err === 'number' || typeof err === 'boolean') {
        return { message: String(err) };
    }

    return serializeError(err, { maxDepth: 5 });
}

/**
 * Transform any Error or primitive to a string
 */
export function stringifyError(err: unknown, opts?: { pretty?: boolean; stack?: boolean }) {
    const serialized = serializeError(err);
    const allowedErrorProperties = ['name', 'message', 'provider_error_payload', ...(opts?.stack ? ['stack', 'cause'] : [])];

    const enriched: Record<string, unknown> = {
        ...(serialized && typeof serialized === 'object' ? serialized : {})
    };

    if (typeof err === 'object' && err != null) {
        const anyErr = err as any;

        // handle axios response data - only extract error field if it exists
        if (anyErr.response?.data) {
            const responseData = anyErr.response.data;

            // If error field exists, filter it to only include message-related fields
            if (responseData && typeof responseData === 'object') {
                const filteredError: Record<string, unknown> = {};
                for (const field of PROVIDER_ERROR_MESSAGE_FIELDS) {
                    if (field in responseData.error) {
                        filteredError[field] = responseData.error[field];
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

let sentry = false;
export function initSentry({ dsn, hash, applicationName }: { dsn: string | undefined; hash?: string | undefined; applicationName: string }) {
    Sentry.init({
        dsn: dsn || '',
        sampleRate: 1,
        skipOpenTelemetrySetup: true, // If false or not set, sentry is breaking our otel setup for logs export
        enabled: dsn ? true : false,
        release: `${NANGO_VERSION}@${hash || 'no_hash'}`,
        serverName: applicationName,
        maxBreadcrumbs: 10
    });
    if (dsn) {
        sentry = true;
        logger.info('Sentry configured');
    }
}

const logger = getLogger('err');
export function report(err: unknown, extra?: Record<string, unknown>) {
    if (!sentry) {
        logger.error(stringifyError(err, { stack: true, pretty: true }), extra);
        return;
    }

    logger.error(err as any, extra);

    Sentry.withScope((scope) => {
        if (extra) {
            scope.setExtras(extra);
        }

        Sentry.captureException(err);
    });
}
