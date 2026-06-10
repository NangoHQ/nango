import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { FolkWebhookPayload, WebhookHandler } from './types.js';
import type { IntegrationConfig } from '@nangohq/types';

/**
 * Verify Folk webhook signature using Svix's HMAC-SHA256 scheme.
 * Signed content: `{webhook-id}.{webhook-timestamp}.{rawBody}`
 * The secret is a base64-encoded key prefixed with `whsec_`.
 * The `webhook-signature` header contains space-separated `v1,<base64>` signatures.
 */
function validate(integration: IntegrationConfig, headers: Record<string, string>, rawBody: string): boolean {
    const secret = integration.custom?.['webhookSecret'];
    if (!secret) {
        // Folk webhooks are registered at the connection level, so checking against an integration secret only works if there is only a single connection for this integration.
        // In practice, the platform does not currently support validating Folk webhooks so we will allow requests through here until we add connection level webhook validation.
        return true;
    }

    const msgId = headers['webhook-id'];
    const msgTimestamp = headers['webhook-timestamp'];
    const msgSignature = headers['webhook-signature'];

    if (!msgId || !msgTimestamp || !msgSignature) {
        return false;
    }

    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const toSign = `${msgId}.${msgTimestamp}.${rawBody}`;
    const computed = crypto.createHmac('sha256', secretBytes).update(toSign).digest('base64');

    return msgSignature
        .split(' ')
        .map((sig) => sig.replace(/^v1,/, ''))
        .some((sig) => {
            try {
                const sigBuf = Buffer.from(sig, 'base64');
                const computedBuf = Buffer.from(computed, 'base64');
                return sigBuf.length === computedBuf.length && crypto.timingSafeEqual(sigBuf, computedBuf);
            } catch {
                return false;
            }
        });
}

const route: WebhookHandler<FolkWebhookPayload> = async (nango, headers, body, rawBody, query) => {
    if (!validate(nango.integration, headers, rawBody)) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const connectionIdentifierValue = query?.['nangoConnectionId'];

    if (!connectionIdentifierValue) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    const response = await nango.executeScriptForWebhooks({
        body,
        webhookType: 'type',
        connectionIdentifierValue,
        propName: 'connectionId'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
