import { NangoError } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { validateHmacSignature } from './signature.js';

import type { AutotaskWebhookPayload, WebhookHandler } from './types.js';
import type { IntegrationConfig } from '@nangohq/types';

const logger = getLogger('Webhook.Autotask');

/**
 * Verify Autotask webhook HMAC-SHA1 signature.
 * Autotask sends the signature in the `x-hook-signature` header as `sha1=<base64-hash>`.
 * See: https://www.autotask.net/help/developerhelp/Content/APIs/Webhooks/SecretKeyPayloadVerification.htm
 */
function validate(integration: IntegrationConfig, headerSignature: string, rawBody: string): boolean {
    const secret = integration.custom?.['webhookSecret'];
    if (!secret) {
        return false;
    }

    return validateHmacSignature({ secret, rawBody, signature: headerSignature, algorithm: 'sha1', digest: 'base64', prefix: 'sha1=' });
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
        payload: body,
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
