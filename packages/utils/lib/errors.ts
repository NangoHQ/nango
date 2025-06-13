import { serializeError } from 'serialize-error';
import * as Sentry from '@sentry/node';
import { getLogger } from './logger.js';
import { NANGO_VERSION } from './version.js';

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
    const serialized = serializeError(err);
    const allowedErrorProperties = ['name', 'message', 'provider_error_payload', ...(opts?.stack ? ['stack', 'cause'] : [])];

    const enriched: Record<string, unknown> = {
        ...serialized
    };

    // Extract additional context from Boom error objects (used in simpleoauth flow)
    // since Boom errors often wrap valuable information like `data.payload`,
    // which isn't included in the default serialization but is useful for user-facing error messages.
    if (typeof err === 'object' && err != null) {
        const anyErr = err as any;

        const payload = anyErr.data?.payload;
        if (payload && typeof payload === 'object') {
            enriched['provider_error_payload'] = payload;
        }
    }
    const filtered: Record<string, unknown> = Object.fromEntries(Object.entries(enriched).filter(([key]) => allowedErrorProperties.includes(key)));
    return JSON.stringify(filtered, null, opts?.pretty ? 2 : undefined);
}

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
        logger.info('Sentry configured');
    }
}

const logger = getLogger('[err]');
export function report(err: unknown, extra?: Record<string, string | number | null | undefined>) {
    logger.error(err as any, extra);

    Sentry.withScope((scope) => {
        if (extra) {
            scope.setExtras(extra);
        }

        Sentry.captureException(err);
    });
}
