import { Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

const route: WebhookHandler = async (nango, headers, body) => {
    // https://developers.google.com/workspace/calendar/api/guides/push
    // we will need to just forward the headers since the body is empty

    // Extract email from x-goog-resource-uri header
    // Format: https://www.googleapis.com/calendar/v3/calendars/{email}/events?alt=json
    let emailAddress: string | undefined;
    const resourceUri = headers['x-goog-resource-uri'];

    if (typeof resourceUri === 'string') {
        const match = resourceUri.match(/\/calendars\/([^/]+)\//);
        if (match && match[1]) {
            emailAddress = decodeURIComponent(match[1]);
        }
    }

    const response = await nango.executeScriptForWebhooks({
        body,
        ...(headers['x-goog-resource-state'] && { webhookTypeValue: headers['x-goog-resource-state'] }),
        ...(emailAddress && { connectionIdentifierValue: emailAddress }),
        propName: 'metadata.emailAddress'
    });

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response?.connectionIds || [],
        toForward: headers
    });
};

export default route;
