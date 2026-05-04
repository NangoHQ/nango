import { Ok } from '@nangohq/utils';

import { hashEmailAddress } from '../utils/pii.js';

import type { WebhookHandler } from './types.js';

const route: WebhookHandler = async (nango, headers) => {
    // https://developers.google.com/workspace/calendar/api/guides/push
    // we will need to just forward the headers since the body is empty
    const resourceUri = headers['x-goog-resource-uri'];

    if (!resourceUri || typeof resourceUri !== 'string') {
        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds: [],
            toForward: headers
        });
    }

    const baseArgs = {
        body: headers,
        ...(headers['x-goog-resource-state'] && { webhookTypeValue: headers['x-goog-resource-state'] })
    };

    // First, try to match the resource URI to the googleCalendarWatchResourceUris (multiple calendar matching)
    let response = await nango.executeScriptForWebhooks({
        ...baseArgs,
        connectionIdentifierValue: resourceUri,
        propName: 'metadata.googleCalendarWatchResourceUris'
    });

    // If no match, fallback to primary calendar matching based on email address
    if (response.connectionIds.length === 0) {
        let emailAddress: string | undefined;
        const match = resourceUri.match(/\/calendars\/([^/]+)\//);
        if (match && match[1]) {
            emailAddress = decodeURIComponent(match[1]);
        }
        const emailAddressHash = emailAddress ? hashEmailAddress(emailAddress) : undefined;

        // Fallback to connection_config.emailAddressHash (primary calendar matching)
        if (response.connectionIds.length === 0) {
            response = await nango.executeScriptForWebhooks({
                ...baseArgs,
                connectionIdentifier: 'emailAddressHash',
                ...(emailAddressHash && { connectionIdentifierValue: emailAddressHash }),
                propName: 'emailAddressHash'
            });
        }

        // Fallback further to metadata.emailAddress (primary calendar matching)
        if (response.connectionIds.length === 0) {
            response = await nango.executeScriptForWebhooks({
                ...baseArgs,
                connectionIdentifier: 'emailAddress',
                ...(emailAddress && { connectionIdentifierValue: emailAddress }),
                propName: 'metadata.emailAddress'
            });
        }

        // Fallback further to metadata.email (primary calendar matching)
        if (response.connectionIds.length === 0) {
            response = await nango.executeScriptForWebhooks({
                ...baseArgs,
                connectionIdentifier: 'emailAddress',
                ...(emailAddress && { connectionIdentifierValue: emailAddress }),
                propName: 'metadata.email'
            });
        }
    }

    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds: response.connectionIds,
        toForward: headers
    });
};

export default route;
