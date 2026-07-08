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

    const response =
        resourceId && typeof resourceId === 'string'
            ? await nango.executeScriptForWebhooks({
                  ...baseArgs,
                  connectionIdentifierValue: resourceId,
                  propName: 'googleDriveWatchResourceId'
              })
            : { connectionIds: [] as string[], connectionMetadata: {} };

    // Fallback: same resourceUri match as the base `google` routing script, kept inline so existing
    // google-drive connections that were matched through the inherited googleWebhookRouting script
    // keep working unchanged.
    const connectionIds =
        response.connectionIds.length > 0
            ? response.connectionIds
            : typeof resourceUri === 'string'
              ? (
                    await nango.executeScriptForWebhooks({
                        ...baseArgs,
                        connectionIdentifierValue: resourceUri,
                        propName: 'metadata.googleCalendarWatchResourceUris'
                    })
                ).connectionIds
              : [];

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds,
        toForward: headers
    });
};

export default route;
