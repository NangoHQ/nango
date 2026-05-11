import { Ok } from '@nangohq/utils';

import type { WebhookHandler } from './types.js';

function extractBaseUrl(body: Record<string, any>): string | undefined {
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
    try {
        return new URL(selfUrl).origin;
    } catch {
        return undefined;
    }
}

async function routeEvent(nango: Parameters<WebhookHandler>[0], event: Record<string, any>): Promise<string[]> {
    const baseUrl = extractBaseUrl(event);
    if (!baseUrl) {
        return [];
    }
    const response = await nango.executeScriptForWebhooks({
        body: event,
        webhookType: 'webhookEvent',
        connectionIdentifierValue: baseUrl,
        propName: 'baseUrl'
    });
    return response?.connectionIds || [];
}

const route: WebhookHandler = async (nango, _headers, body) => {
    if (Array.isArray(body)) {
        let connectionIds: string[] = [];
        for (const event of body) {
            const ids = await routeEvent(nango, event);
            if (ids.length > 0) {
                connectionIds = connectionIds.concat(ids);
            }
        }

        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds
        });
    } else {
        const connectionIds = await routeEvent(nango, body);
        return Ok({
            content: { status: 'success' },
            statusCode: 200,
            connectionIds,
            toForward: body
        });
    }
};

export default route;
