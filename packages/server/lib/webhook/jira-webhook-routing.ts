import { NangoError } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { validateHmacSignature } from './signature.js';

import type { InternalNango } from './internal-nango.js';
import type { WebhookHandler } from './types.js';

function getOrigin(url: string): string | undefined {
    try {
        return new URL(url).origin;
    } catch {
        return undefined;
    }
}

function extractBaseUrl(body: Record<string, any> | null | undefined): string | undefined {
    if (!body) {
        return undefined;
    }
    const selfUrl =
        body['issue']?.['self'] ||
        body['comment']?.['self'] ||
        body['sprint']?.['self'] ||
        body['board']?.['self'] ||
        body['worklog']?.['self'] ||
        body['version']?.['self'] ||
        body['issueLink']?.['self'] ||
        body['project']?.['self'] ||
        body['attachment']?.['self'] ||
        body['issuetype']?.['self'] ||
        body['filter']?.['self'] ||
        body['user']?.['self'];
    if (!selfUrl) {
        return undefined;
    }
    return getOrigin(selfUrl);
}

async function routeEvent(nango: InternalNango, event: Record<string, any>): Promise<string[]> {
    const baseUrl = extractBaseUrl(event);
    if (!baseUrl) {
        return [];
    }
    const response = await nango.executeScriptForWebhooks({
        payload: event,
        webhookType: 'webhookEvent',
        connectionIdentifierValue: baseUrl,
        propName: 'baseUrl'
    });
    return response?.connectionIds || [];
}

const route: WebhookHandler = async (nango, headers, body, rawBody) => {
    const secret = nango.integration.custom?.['webhookSecret'];
    if (secret) {
        const signature = headers['x-hub-signature'];
        if (!signature) {
            return Err(new NangoError('webhook_missing_signature'));
        }
        if (!validateHmacSignature({ secret, rawBody, signature, prefix: 'sha256=' })) {
            return Err(new NangoError('webhook_invalid_signature'));
        }
    } else {
        nango.markUnverified({ reason: 'jira_missing_webhook_secret' });
    }

    const connectionIds = await routeEvent(nango, body);
    return Ok({
        content: { status: 'success' },
        statusCode: 200,
        connectionIds,
        toForward: body
    });
};

export default route;
