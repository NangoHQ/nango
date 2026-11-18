import { NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { countUnverifiedWebhook } from './missing-secret.js';
import { verifyNangoWebhookSecret } from './nango-webhook-secret.js';
import { safeCompare } from './signature.js';

import type { InternalNango } from './internal-nango.js';
import type { IntegrationConfig } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('Webhook.GoogleChannelToken');

function reject(integration: IntegrationConfig, reason: string, errorType: 'webhook_missing_token' | 'webhook_invalid_signature'): Result<void> {
    logger.error(reason, { configId: integration.id, provider: integration.provider, environmentId: integration.environment_id });
    countUnverifiedWebhook({ environmentId: integration.environment_id, provider: integration.provider, reason, outcome: 'rejected' });
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

/**
 * Pub/Sub's OIDC token proves Google signed the push, not whose subscription sent it: any service
 * account can mint one for any audience. So a push must carry both the token and the integration's
 * webhook secret. Pub/Sub can't set headers, so the secret goes in the push endpoint as
 * `?nangoWebhookSecret=`.
 *
 * Unlike `google-mail`, there are no legacy unsigned setups to migrate on this route, so neither
 * check can be bypassed with "Allow unverified webhooks". The JWT itself is verified by the Gmail route.
 */
export function validateGooglePubSubPush(nango: InternalNango, headers: Record<string, string>, query: Record<string, string> | undefined): Result<void> {
    const { integration } = nango;

    const secretResult = verifyNangoWebhookSecret({ secret: integration.custom?.['webhookSecret'], headers, query });
    if (secretResult.isErr()) {
        switch (secretResult.error.type) {
            case 'webhook_invalid_secret':
                // Unset, or shorter than 16 characters.
                return reject(integration, 'google_missing_pubsub_webhook_secret', 'webhook_missing_token');
            case 'webhook_missing_signature':
                return reject(integration, 'google_pubsub_missing_webhook_secret', 'webhook_missing_token');
            default:
                return reject(integration, 'google_pubsub_invalid_webhook_secret', 'webhook_invalid_signature');
        }
    }

    if (!headers['authorization']) {
        return reject(integration, 'google_pubsub_missing_authorization', 'webhook_invalid_signature');
    }

    return Ok(undefined);
}
