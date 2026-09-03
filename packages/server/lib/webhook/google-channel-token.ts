import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, getLogger, metrics, Ok } from '@nangohq/utils';

import type { IntegrationConfig } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('Webhook.GoogleChannelToken');

function safeCompare(expected: string, received: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);

    return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function reject(integration: IntegrationConfig, reason: string, errorType: 'webhook_missing_token' | 'webhook_invalid_signature'): Result<void> {
    logger.error(reason, { configId: integration.id, provider: integration.provider, environmentId: integration.environment_id });
    metrics.increment(metrics.Types.WEBHOOK_INCOMING_UNVERIFIED, 1, {
        environmentId: integration.environment_id,
        provider: integration.provider,
        reason
    });
    return Err(new NangoError(errorType));
}

/**
 * Google push notifications have no HMAC. Authenticity is the `token` set at
 * watch registration and echoed as `X-Goog-Channel-Token`.
 * Verification runs only when the integration has a webhook secret.
 */
export function validateGoogleChannelToken(integration: IntegrationConfig, headers: Record<string, any>): Result<void> {
    const expected = integration.custom?.['webhookSecret'];
    if (expected == null || expected === '') {
        return Ok(undefined);
    }
    if (typeof expected !== 'string') {
        return reject(integration, 'google_malformed_webhook_secret', 'webhook_invalid_signature');
    }

    const received = headers['x-goog-channel-token'];
    if (!received || typeof received !== 'string') {
        return reject(integration, 'google_missing_channel_token', 'webhook_missing_token');
    }

    if (!safeCompare(expected, received)) {
        return reject(integration, 'google_invalid_channel_token', 'webhook_invalid_signature');
    }

    return Ok(undefined);
}
