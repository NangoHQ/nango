import crypto from 'node:crypto';

import { getFlags } from '@nangohq/feature-flags';
import { connectionService, NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { safeCompare } from './signature.js';

import type { AirtableWebhookReference, WebhookHandler } from './types.js';
import type { DBConnectionDecrypted } from '@nangohq/types';

const MAC_PREFIX = 'hmac-sha256=';

// Airtable returns macSecretBase64 once, when the webhook is created, so the connection has to
// store it next to the webhook id it routes on.
// https://airtable.com/developers/web/api/webhooks-overview#webhook-notification-delivery
function getMacSecret(connection: DBConnectionDecrypted, webhookId: string): Buffer | null {
    const webhooks = connection.metadata?.['webhooks'];
    if (!webhooks || typeof webhooks !== 'object' || Array.isArray(webhooks)) {
        return null;
    }

    const webhook = (webhooks as Record<string, { macSecretBase64?: unknown } | undefined>)[webhookId];
    if (typeof webhook?.macSecretBase64 !== 'string') {
        return null;
    }

    // An empty key makes the MAC computable by anyone who knows the body.
    const secret = Buffer.from(webhook.macSecretBase64, 'base64');
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
    const secrets = connections.map((connection) => getMacSecret(connection, webhookId));

    if (secrets.length > 0 && secrets.every((secret) => secret !== null)) {
        const mac = headers['x-airtable-content-mac'];
        if (!mac) {
            return Err(new NangoError('webhook_missing_signature'));
        }

        if (!secrets.every((secret) => isValidMac(secret, rawBody, mac))) {
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        nango.markUnverified({
            reason: 'airtable_missing_mac_secret',
            remediation: 'Store the webhook macSecretBase64 in the connection metadata under webhooks.<webhook id>'
        });

        // Same response for an unknown webhook id and a connection without a secret, so this
        // does not reveal which webhook ids exist.
        if (!(await getFlags().allowUnauthorizedAirtableWebhook(nango.team.uuid))) {
            return Err(new NangoError('webhook_invalid_secret', { reason: 'No webhook secret configured to validate this request' }));
        }
    }

    // airtable webhooks have a catch-all type so we inject the catch all to be
    // able to route it correctly
    const editedBodyWithCatchAll = { ...body, type: '*' };
    const response = await nango.executeScriptForWebhooks({
        payload: editedBodyWithCatchAll,
        webhookType: 'type',
        connectionIdentifier: 'webhook.id',
        propName: 'metadata.webhooks'
    });
    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: body
    });
};

export default route;
