import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok, getLogger } from '@nangohq/utils';

import type { AutotaskWebhookPayload, WebhookHandler } from './types.js';
import type { IntegrationConfig } from '@nangohq/types';

const logger = getLogger('Webhook.Autotask');

/**
 * Verify Autotask webhook HMAC-SHA1 signature.
 * Autotask sends the signature in the `x-hook-signature` header as `sha1=<base64-hash>`.
 * See: https://www.autotask.net/help/developerhelp/Content/APIs/Webhooks/SecretKeyPayloadVerification.htm
 */
function validate(integration: IntegrationConfig, headerSignature: string, rawBody: string): boolean {
    if (!integration.custom?.['webhookSecret']) {
        return false;
    }

    const prefix = 'sha1=';
    const providedHash = headerSignature.startsWith(prefix) ? headerSignature.substring(prefix.length) : headerSignature;
    const computedHash = crypto.createHmac('sha1', integration.custom['webhookSecret']).update(rawBody).digest('base64');
    const computedBuf = Buffer.from(computedHash);
    const providedBuf = Buffer.from(providedHash);
    return computedBuf.length === providedBuf.length && crypto.timingSafeEqual(computedBuf, providedBuf);
}

/**
 * Webhook routing handler for Autotask.
 *
 * Connection routing: Routes by payload Guid to the connection whose
 * connectionConfig contains the matching `webhookGuid` value.
 *
 * Signature verification: HMAC-SHA1 using the integration's webhook secret.
 * Set `webhook_user_defined_secret: true` in providers.yaml to allow the secret
 * to be configured when creating the integration.
 *
 * Webhook type: The `EntityType` field from the payload (e.g., "Ticket", "Company")
 * is used to match against webhook subscriptions defined in sync configs.
 */
const route: WebhookHandler<AutotaskWebhookPayload> = async (nango, headers, body, rawBody) => {
    const signature = headers['x-hook-signature'];
    if (!signature) {
        logger.error('missing signature', { configId: nango.integration.id });
        return Err(new NangoError('webhook_missing_signature'));
    }

    if (!validate(nango.integration, signature, rawBody)) {
        logger.error('invalid signature', { configId: nango.integration.id });
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const response = await nango.executeScriptForWebhooks({
        body,
        webhookType: 'EntityType',
        connectionIdentifier: 'Guid',
        propName: 'webhookGuid'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
