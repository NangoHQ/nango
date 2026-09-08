import { NangoError } from '@nangohq/shared';
import { Err, getLogger, metrics, Ok } from '@nangohq/utils';

import { safeCompare } from './signature.js';

import type { InternalNango } from './internal-nango.js';
import type { IntegrationConfig } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('Webhook.GoogleChannelToken');

function reject(integration: IntegrationConfig, reason: string, errorType: 'webhook_missing_token' | 'webhook_invalid_signature'): Result<void> {
    logger.error(reason, { configId: integration.id, provider: integration.provider, environmentId: integration.environment_id });
    metrics.increment(metrics.Types.WEBHOOK_INCOMING_UNVERIFIED, 1, {
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
export function validateGoogleChannelToken(nango: InternalNango, headers: Record<string, any>): Result<void> {
    const { integration } = nango;
    const expected = integration.custom?.['webhookSecret'];

    if (expected == null || expected === '') {
        nango.markUnverified({
            reason: 'google_missing_channel_token_secret',
            remediation: 'Set the channel token webhook secret on the integration'
        });
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
