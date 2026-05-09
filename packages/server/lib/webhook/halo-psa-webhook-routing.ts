import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

interface HaloPsaWebhookPayload {
    type?: string;
    webhookType?: string;
    event?: string;
    connectionId?: string;
    connection_id?: string;
    nango?: {
        connectionId?: string;
        webhookType?: string;
    };
    [key: string]: any;
}

type HaloPsaWebhookBody = HaloPsaWebhookPayload | HaloPsaWebhookPayload[];

function firstString(...values: unknown[]): string | undefined {
    for (const value of values) {
        if (typeof value === 'string' && value.length > 0) {
            return value;
        }
    }

    return undefined;
}

function validateBasicAuthorization(header: string | undefined, webhookSecret: string): boolean {
    if (!header?.startsWith('Basic ')) {
        return false;
    }

    try {
        const credentials = Buffer.from(header.substring('Basic '.length), 'base64').toString('utf8');
        const separator = credentials.indexOf(':');

        if (separator < 0) {
            return false;
        }

        const password = credentials.substring(separator + 1);
        return password === webhookSecret;
    } catch {
        return false;
    }
}

const route: WebhookHandler<HaloPsaWebhookBody> = async (nango, headers, body, _rawBody, query) => {
    const webhookSecret = nango.integration.custom?.['webhookSecret'];

    if (webhookSecret && !validateBasicAuthorization(headers['authorization'], webhookSecret)) {
        return Err(new NangoError('webhook_invalid_signature'));
    }

    const bodyObject = Array.isArray(body) ? undefined : body;
    const connectionId = firstString(query?.['connectionId'], bodyObject?.nango?.connectionId, bodyObject?.connectionId, bodyObject?.connection_id);

    if (!connectionId) {
        return Err(new NangoError('webhook_invalid_payload', { reason: 'Missing HaloPSA webhook connectionId' }));
    }

    const webhookType =
        firstString(query?.['webhookType'], bodyObject?.nango?.webhookType, bodyObject?.webhookType, bodyObject?.type, bodyObject?.event) || 'halo-psa';
    const nangoPayload = { ...bodyObject?.nango, connectionId, webhookType };
    const scriptBody = Array.isArray(body)
        ? {
              events: body,
              nango: nangoPayload
          }
        : {
              ...body,
              nango: nangoPayload
          };

    const response = await nango.executeScriptForWebhooks({
        body: scriptBody,
        webhookTypeValue: webhookType,
        connectionIdentifierValue: connectionId,
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
