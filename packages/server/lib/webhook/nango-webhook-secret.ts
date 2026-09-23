import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { safeCompare } from './signature.js';

import type { Result } from '@nangohq/utils';

/**
 * For providers that do not sign their webhooks, the caller proves it holds a secret the customer
 * set on both ends. The header is preferred. The query param exists for providers that only let you
 * configure a URL, and has to be listed in the provider's `webhook_allowed_query_params`.
 */
export const NANGO_WEBHOOK_SECRET_HEADER = 'x-nango-webhook-secret';
export const NANGO_WEBHOOK_SECRET_QUERY_PARAM = 'nangoWebhookSecret';

// Customer chosen, so a short one would be guessable from the public webhook URL.
const MIN_SECRET_LENGTH = 16;

export function verifyNangoWebhookSecret({
    secret,
    headers,
    query
}: {
    secret: unknown;
    headers: Record<string, string>;
    query?: Record<string, string> | undefined;
}): Result<void, NangoError> {
    if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
        return Err(new NangoError('webhook_invalid_secret', { reason: 'No webhook secret configured to validate this request' }));
    }

    const presented = headers[NANGO_WEBHOOK_SECRET_HEADER] || query?.[NANGO_WEBHOOK_SECRET_QUERY_PARAM];
    if (!presented) {
        return Err(new NangoError('webhook_missing_signature'));
    }

    if (!safeCompare(secret, presented)) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    return Ok(undefined);
}

export function withoutNangoWebhookSecret(query: Record<string, string>): Record<string, string> {
    const { [NANGO_WEBHOOK_SECRET_QUERY_PARAM]: _secret, ...rest } = query;
    return rest;
}
