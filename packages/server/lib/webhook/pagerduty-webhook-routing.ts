import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import type { PagerDutyWebhookPayload, WebhookHandler } from './types.js';

function isIpInWhitelist(ip: string, whitelist: string[]): boolean {
    return whitelist.includes(ip);
}

function getClientIp(headers: Record<string, any>): string | undefined {
    const forwardedFor = headers['x-forwarded-for'];
    if (forwardedFor) {
        return forwardedFor.split(',')[0]?.trim();
    }

    // fallback to other common headers
    const realIp = headers['x-real-ip'];
    if (realIp) {
        return realIp;
    }

    return undefined;
}

const route: WebhookHandler<PagerDutyWebhookPayload> = async (nango, headers, body) => {
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
    const ipWhitelist = connectionMetadata?.['ipSafelist'] as string[] | undefined;

    if (ipWhitelist) {
        const clientIp = getClientIp(headers);

        if (!clientIp) {
            return Ok({
                content: { status: 'success' },
                statusCode: 200,
                connectionIds: [],
                toForward: body
            });
        }

        if (!isIpInWhitelist(clientIp, ipWhitelist)) {
            return Ok({
                content: { status: 'success' },
                statusCode: 200,
                connectionIds: [],
                toForward: body
            });
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
