import { Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const getOrigin = (url: string): string | null => {
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
};

const extractBaseUrlFromSelfLink = (value: unknown): string | null => {
    if (Array.isArray(value)) {
        for (const item of value) {
            const baseUrl = extractBaseUrlFromSelfLink(item);
            if (baseUrl) {
                return baseUrl;
            }
        }

        return null;
    }

    if (!isRecord(value)) {
        return null;
    }

    if (typeof value['self'] === 'string') {
        const baseUrl = getOrigin(value['self']);
        if (baseUrl) {
            return baseUrl;
        }
    }

    for (const item of Object.values(value)) {
        const baseUrl = extractBaseUrlFromSelfLink(item);
        if (baseUrl) {
            return baseUrl;
        }
    }

    return null;
};

const route: WebhookHandler = async (nango, _headers, body) => {
    if (Array.isArray(body)) {
        let connectionIds: string[] = [];
        for (const event of body) {
            const baseUrl = extractBaseUrlFromSelfLink(event);

            const response = await nango.executeScriptForWebhooks({
                body: event,
                webhookType: 'webhookEvent',
                ...(baseUrl ? { connectionIdentifierValue: baseUrl } : {}),
                propName: 'baseUrl'
            });
            if (response && response.connectionIds?.length > 0) {
                connectionIds = connectionIds.concat(response.connectionIds);
            }
        }

        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds
        });
    } else {
        const baseUrl = extractBaseUrlFromSelfLink(body);

        const response = await nango.executeScriptForWebhooks({
            body,
            webhookType: 'webhookEvent',
            ...(baseUrl ? { connectionIdentifierValue: baseUrl } : {}),
            propName: 'baseUrl'
        });
        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: response?.connectionIds || [],
            toForward: body
        });
    }
};

export default route;
