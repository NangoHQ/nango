import { Err, Ok } from '@nangohq/utils';

import { validateGoogleChannelToken } from './google-channel-token.js';

import type { WebhookHandler } from './types.js';

/**
 * Calendar push routing for the base `google` integration: metadata URI list only
 * (no email / emailAddressHash fallbacks).
 */
const route: WebhookHandler = async (nango, headers) => {
    const tokenResult = validateGoogleChannelToken(nango.integration, headers);
    if (tokenResult.isErr()) {
        return Err(tokenResult.error);
    }

    const resourceUri = headers['x-goog-resource-uri'];

    const baseArgs = {
        body: headers,
        ...(headers['x-goog-resource-state'] && { webhookTypeValue: headers['x-goog-resource-state'] })
    };

    const response =
        typeof resourceUri === 'string'
            ? await nango.executeScriptForWebhooks({
                  ...baseArgs,
                  connectionIdentifierValue: resourceUri,
                  propName: 'metadata.googleCalendarWatchResourceUris'
              })
            : { connectionIds: [] as string[], connectionMetadata: {} };

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response.connectionIds,
        toForward: headers
    });
};

export default route;
