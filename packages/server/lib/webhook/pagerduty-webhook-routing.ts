import crypto from 'node:crypto';

import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { PagerDutyWebhookPayload, WebhookHandler } from './types.js';

function verifySignature(secret: string, payload: string, signatures: string): boolean {
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const signatureWithVersion = `v1=${signature}`;
    const signatureList = signatures.split(',').map((signature) => signature.trim());

    return signatureList.includes(signatureWithVersion);
}

const route: WebhookHandler<PagerDutyWebhookPayload> = async (nango, headers, body, rawBody) => {
    // https://developer.pagerduty.com/docs/webhooks-overview#custom-headers
    const connectionIdentifierValue = headers['x-nango-connection-id'];

    if (!connectionIdentifierValue) {
        return Err(new NangoError('webhook_missing_nango_connection_id'));
    }

    const response = await nango.executeScriptForWebhooks({
        body,
        webhookType: 'event.event_type',
        connectionIdentifierValue,
        propName: 'connectionId'
    });

    const connectionId = response?.connectionIds?.[0];

    if (!connectionId) {
        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: [],
            toForward: body
        });
    }

    const connectionMetadata = response.connectionMetadata[connectionId];
    const webhookSecret = connectionMetadata?.['webhookSecret'];

    if (webhookSecret) {
        const signatureHeader = headers['x-pagerduty-signature'];
        if (!signatureHeader) {
            return Err(new NangoError('webhook_missing_signature'));
        }

        let secret: string;
        // enforce a single secret because pagerduty generates a new secret for each subscription.
        // pagerduty sends multiple signatures in the header, which can slow down verification, so we enforce only a single secret on our side.
        // https://developer.pagerduty.com/docs/verifying-webhook-signatures
        if (Array.isArray(webhookSecret)) {
            if (webhookSecret.length === 0) {
                return Err(new NangoError('webhook_invalid_secret', { reason: 'No webhook secret configured' }));
            }
            if (webhookSecret.length > 1) {
                return Err(new NangoError('webhook_invalid_secret', { reason: 'Multiple webhook secrets configured. Only one secret is allowed.' }));
            }
            secret = webhookSecret[0];
        } else if (typeof webhookSecret === 'string') {
            secret = webhookSecret;
        } else {
            return Err(new NangoError('webhook_invalid_secret', { reason: 'Invalid webhook secret' }));
        }

        if (!verifySignature(secret, rawBody, signatureHeader)) {
            return Err(new NangoError('webhook_invalid_signature'));
        }
    }

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: [connectionId],
        toForward: body
    });
};

export default route;
