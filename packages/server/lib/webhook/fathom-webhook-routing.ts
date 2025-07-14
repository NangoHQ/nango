import { Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';

const route: WebhookHandler = async (nango, integration, _headers, body, _rawBody, logContextGetter: LogContextGetter) => {
    const response = await nango.executeScriptForWebhooks(
        integration,
        body,
        // TODO: What is webhookType?
        // Fathom only has one type of webhook - new meeting content ready.
        'new_meeting_content_ready',
        // TODO: What is connectionIdentifier?
        // Since each webhook URL that nango generates is unique to a connection,
        // by definition, there is only one connection per webhook URL.
        '',
        logContextGetter
        // TODO: What is propName?
        // Doesn't seem necessary for this webhook.
    );

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response.connectionIds,
        toForward: body
    });
};

export default route;
