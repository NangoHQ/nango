import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { safeCompare } from './signature.js';

import type { WebhookResponse } from './types.js';
import type { Metadata } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

/**
 * For providers that do not sign their webhooks, the caller proves it holds the secret stored on the
 * connection the webhook is routed to, as `webhookSecret` in its metadata. The header is preferred. The
 * query param exists for providers that only let you configure a URL, and has to be listed in the
 * provider's `webhook_allowed_query_params`.
 *
 * The secret is per connection on purpose. It usually sits in the end user's own webhook config, where
 * their admins can read it, so one shared by the integration would let them post events for everyone.
 *
 * TODO: NAN-6927 connection metadata is a stopgap for where connection-level secrets live.
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

/** The connections whose own `webhookSecret` matches the one the caller sent. */
export function connectionsWithValidSecret<T extends { metadata: Metadata | null }>(
    connections: T[],
    headers: Record<string, string>,
    query?: Record<string, string>
): T[] {
    return connections.filter((connection) => verifyNangoWebhookSecret({ secret: connection.metadata?.['webhookSecret'], headers, query }).isOk());
}

/**
 * The rejection when no connection verifies. It depends only on whether the caller sent a secret, so an
 * unknown connection, one without a secret and one with a different secret all look the same.
 */
export function rejectUnverifiedWebhook(headers: Record<string, string>, query?: Record<string, string>): Result<WebhookResponse> {
    const presented = headers[NANGO_WEBHOOK_SECRET_HEADER] || query?.[NANGO_WEBHOOK_SECRET_QUERY_PARAM];
    return Err(new NangoError(presented ? 'webhook_invalid_signature' : 'webhook_missing_signature'));
}

export function withoutNangoWebhookSecret(query: Record<string, string>): Record<string, string> {
    const { [NANGO_WEBHOOK_SECRET_QUERY_PARAM]: _secret, ...rest } = query;
    return rest;
}
