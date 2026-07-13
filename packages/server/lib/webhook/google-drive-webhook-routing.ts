import { Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

// https://developers.google.com/workspace/drive/api/guides/push
const route: WebhookHandler = async (nango, headers) => {
    const resourceId = headers['x-goog-resource-id'];
    const resourceUri = headers['x-goog-resource-uri'];

    const baseArgs = {
        body: headers,
        ...(headers['x-goog-resource-state'] && { webhookTypeValue: headers['x-goog-resource-state'] })
    };

    // Fallback: same resourceUri match as the base `google` routing script, kept inline so existing
    // google-drive connections that were matched through the inherited googleWebhookRouting script
    // keep working unchanged.
    const connectionIds = await (async () => {
        if (resourceId && typeof resourceId === 'string') {
            const { connectionIds } = await nango.executeScriptForWebhooks({
                ...baseArgs,
                connectionIdentifierValue: resourceId,
                propName: 'googleDriveWatchResourceId'
            });
            if (connectionIds.length > 0) {
                return connectionIds;
            }
        }

        if (typeof resourceUri === 'string') {
            const { connectionIds } = await nango.executeScriptForWebhooks({
                ...baseArgs,
                connectionIdentifierValue: resourceUri,
                propName: 'metadata.googleCalendarWatchResourceUris'
            });
            return connectionIds;
        }

        return [];
    })();

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds,
        toForward: headers
    });
};

export default route;
