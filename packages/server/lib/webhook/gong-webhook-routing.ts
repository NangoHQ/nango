import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';

import { getGlobalWebhookReceiveUrl, NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { GongWebhookPayload, WebhookHandler } from './types.js';

interface GongWebhookJwtClaims {
    webhook_url?: string;
    body_sha256?: string;
    exp?: number;
}

// Gong's "Show public key" UI hands out the bare base64 DER body with no PEM wrapper, which
// jwt.verify can't parse on its own - add it back if it's missing.
function toPemPublicKey(key: string): string {
    if (key.startsWith('-----BEGIN PUBLIC KEY-----')) {
        return key;
    }
    return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
}

// Gong's automation rule is registered against one specific destination URL (including the
// nangoConnectionId query param), and echoes that exact URL back in the webhook_url claim. Checking
// it against the URL the request actually came in on binds the signed delivery to one connection,
// so a valid signature for connection A can't be replayed by requesting it with connection B's id.
function isExpectedWebhookUrl(claimedUrl: string | undefined, expectedBaseUrl: string, connectionIdentifierValue: string): boolean {
    if (!claimedUrl) {
        return false;
    }

    try {
        const claimed = new URL(claimedUrl);
        const expected = new URL(expectedBaseUrl);
        return (
            claimed.origin === expected.origin &&
            claimed.pathname === expected.pathname &&
            claimed.searchParams.get('nangoConnectionId') === connectionIdentifierValue
        );
    } catch {
        return false;
    }
}

// Gong signs webhook deliveries with a JWT (RS256) in the Authorization header, using the
// automation rule's public key. See https://help.gong.io/docs/prepare-your-receiving-application-to-receive-a-webhook-jwt-header
function validate(
    publicKey: string,
    token: string,
    rawBody: string | Buffer,
    webhookUrlContext: { expectedBaseUrl: string; connectionIdentifierValue: string }
): boolean {
    let claims: GongWebhookJwtClaims;
    try {
        claims = jwt.verify(token, toPemPublicKey(publicKey), { algorithms: ['RS256'] }) as GongWebhookJwtClaims;
    } catch {
        return false;
    }

    if (!isExpectedWebhookUrl(claims.webhook_url, webhookUrlContext.expectedBaseUrl, webhookUrlContext.connectionIdentifierValue)) {
        return false;
    }

    if (!claims.body_sha256) {
        return false;
    }

    const payloadString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    const expected = crypto.createHash('sha256').update(payloadString, 'utf8').digest('hex');

    try {
        const expectedBuf = Buffer.from(expected, 'hex');
        const providedBuf = Buffer.from(claims.body_sha256, 'hex');
        return expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);
    } catch {
        return false;
    }
}

function verifySignature(
    publicKey: string,
    headers: Record<string, string>,
    rawBody: string | Buffer,
    webhookUrlContext: { expectedBaseUrl: string; connectionIdentifierValue: string }
): 'valid' | 'missing' | 'invalid' {
    const authHeader = headers['authorization'];
    if (!authHeader) {
        return 'missing';
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    return validate(publicKey, token, rawBody, webhookUrlContext) ? 'valid' : 'invalid';
}

const route: WebhookHandler<GongWebhookPayload> = async (nango, headers, body, rawBody, query) => {
    // Gong's webhook payload carries no connection identifier, so route by the
    // nangoConnectionId query param on the webhook URL.
    const connectionIdentifierValue = query?.['nangoConnectionId'];

    if (!connectionIdentifierValue) {
        return Err(new NangoError('webhook_missing_connection_id'));
    }

    const webhookUrlContext = {
        expectedBaseUrl: `${getGlobalWebhookReceiveUrl()}/${nango.environment.uuid}/${encodeURIComponent(nango.integration.unique_key)}`,
        connectionIdentifierValue
    };

    const integrationPublicKey = nango.integration.custom?.['webhookSecret'];

    if (integrationPublicKey) {
        const result = verifySignature(integrationPublicKey, headers, rawBody, webhookUrlContext);
        if (result !== 'valid') {
            return Err(new NangoError(result === 'missing' ? 'webhook_missing_signature' : 'webhook_invalid_signature'));
        }
    }

    const connection = await nango.getConnectionForWebhook(connectionIdentifierValue);
    if (!connection) {
        // Already verified above if an integration-level key is set; otherwise there's nothing left to validate against.
        if (!integrationPublicKey) {
            return Err(new NangoError('webhook_invalid_secret', { reason: 'No webhook secret configured to validate this request' }));
        }

        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: [],
            toForward: body
        });
    }

    // Gong's public key is issued per automation rule, so a single integration-level key only
    // covers one connection. Setups with more than one Gong connection fall back to a key set
    // on each connection's metadata instead.
    if (!integrationPublicKey) {
        const connectionPublicKey = connection.metadata?.['webhookSecret'];
        if (connectionPublicKey != null && typeof connectionPublicKey !== 'string') {
            return Err(new NangoError('webhook_invalid_secret', { reason: 'Invalid webhook public key' }));
        }

        if (!connectionPublicKey) {
            return Err(new NangoError('webhook_invalid_secret', { reason: 'No webhook secret configured to validate this request' }));
        }

        const result = verifySignature(connectionPublicKey, headers, rawBody, webhookUrlContext);
        if (result !== 'valid') {
            return Err(new NangoError(result === 'missing' ? 'webhook_missing_signature' : 'webhook_invalid_signature'));
        }
    }

    const response = await nango.executeScriptForWebhooks({
        body,
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
