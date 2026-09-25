import crypto from 'node:crypto';

import { getFlags } from '@nangohq/feature-flags';
import { connectionService, NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { safeCompare } from './signature.js';

import type { AirtableWebhookReference, WebhookHandler } from './types.js';
import type { DBConnectionDecrypted } from '@nangohq/types';

const MAC_PREFIX = 'hmac-sha256=';
const MISSING_SECRET = {
    reason: 'airtable_missing_mac_secret',
    remediation: 'Store the webhook macSecretBase64 in the connection metadata as webhooks.<webhook id>'
};

// Airtable returns macSecretBase64 once, when the webhook is created, so the connection has to
// store it next to the webhook id it routes on, as `webhooks[id]`. That is what the create-webhook template writes.
// https://airtable.com/developers/web/api/webhooks-overview#webhook-notification-delivery
function getMacSecret(connection: DBConnectionDecrypted, webhookId: string): Buffer | null {
    const webhooks = connection.metadata?.['webhooks'];
    if (!webhooks || typeof webhooks !== 'object' || Array.isArray(webhooks)) {
        return null;
    }

    const macSecretBase64 = (webhooks as Record<string, unknown>)[webhookId];
    if (typeof macSecretBase64 !== 'string') {
        return null;
    }

    // An empty key makes the MAC computable by anyone who knows the body.
    const secret = Buffer.from(macSecretBase64, 'base64');
    return secret.length > 0 ? secret : null;
}

function isValidMac(secret: Buffer, rawBody: string, header: string): boolean {
    if (!header.startsWith(MAC_PREFIX)) {
        return false;
    }

    const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    return safeCompare(expected, header.slice(MAC_PREFIX.length), 'hex');
}

const route: WebhookHandler<AirtableWebhookReference> = async (nango, headers, body, rawBody) => {
    const webhookId = body?.webhook?.id;
    if (typeof webhookId !== 'string' || !webhookId) {
        return Err(new NangoError('webhook_invalid_body'));
    }

    const connections =
        (await connectionService.findConnectionsByMetadataValue({
            metadataProperty: 'webhooks',
            payloadIdentifier: webhookId,
            configId: nango.integration.id,
            environmentId: nango.environment.id
        })) || [];

    // Each connection is checked against its own secret, so one connection without a secret
    // neither blocks nor bypasses verification for the others.
    const mac = headers['x-airtable-content-mac'];
    const verified: string[] = [];
    const secretless: string[] = [];
    let hasSecret = false;
    for (const connection of connections) {
        const secret = getMacSecret(connection, webhookId);
        if (!secret) {
            secretless.push(connection.connection_id);
            continue;
        }

        hasSecret = true;
        if (mac && isValidMac(secret, rawBody, mac)) {
            verified.push(connection.connection_id);
        }
    }

    // An unknown webhook id is unverifiable too. Flagged accounts keep getting it forwarded without a connection, as before.
    const needsFlag = !(hasSecret && verified.length === 0) && (secretless.length > 0 || connections.length === 0);
    const allowUnverified = needsFlag && (await getFlags().allowUnauthorizedAirtableWebhook(nango.team.uuid));
    const routed = allowUnverified ? [...verified, ...secretless] : verified;

    if (routed.length === 0 && !(allowUnverified && connections.length === 0)) {
        if (hasSecret) {
            return Err(new NangoError(mac ? 'webhook_invalid_signature' : 'webhook_missing_signature'));
        }

        // An unknown webhook id and a connection without a secret get the same response.
        nango.markUnverified(MISSING_SECRET);
        return Err(new NangoError('webhook_invalid_secret', { reason: 'No webhook secret configured to validate this request' }));
    }

    // Only when unverified connections are kept, otherwise the forwards to verified ones would be flagged too.
    if (allowUnverified) {
        nango.markUnverified(MISSING_SECRET);
    }

    // airtable webhooks have a catch-all type so we inject the catch all to be
    // able to route it correctly
    const editedBodyWithCatchAll = { ...body, type: '*' };
    const connectionIds: string[] = [];
    for (const connectionId of routed) {
        const response = await nango.executeScriptForWebhooks({
            payload: editedBodyWithCatchAll,
            webhookType: 'type',
            connectionIdentifierValue: connectionId,
            propName: 'connectionId'
        });
        connectionIds.push(...response.connectionIds);
    }

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds,
        toForward: body
    });
};

export default route;
