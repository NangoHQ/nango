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
    return JSON.stringify(serializeError(err), ['name', 'message', ...(opts?.stack ? ['stack', 'cause'] : [])], opts?.pretty ? 2 : undefined);
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
