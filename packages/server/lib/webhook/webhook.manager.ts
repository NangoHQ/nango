import tracer from 'dd-trace';

import { WebhookRoutingError, externalWebhookService, getProvider } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';
import { forwardWebhook } from '@nangohq/webhooks';

import * as webhookHandlers from './index.js';
import { internalNango } from './internal-nango.js';

import type { WebhookResponse, WebhookHandlersMap } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';
import type { Config } from '@nangohq/shared';
import type { DBEnvironment, DBTeam } from '@nangohq/types';

const logger = getLogger('Webhook.Manager');

const handlers: WebhookHandlersMap = webhookHandlers as unknown as WebhookHandlersMap;

export async function routeWebhook({
    environment,
    account,
    integration,
    headers,
    body,
    rawBody,
    logContextGetter
}: {
    environment: DBEnvironment;
    account: DBTeam;
    integration: Config;
    headers: Record<string, any>;
    body: any;
    rawBody: string;
    logContextGetter: LogContextGetter;
}): Promise<WebhookResponse> {
    if (!body) {
        return {
            content: null,
            statusCode: 204
        };
    }

    const provider = getProvider(integration.provider);
    if (!provider || !provider['webhook_routing_script']) {
        return {
            content: null,
            statusCode: 204
        };
    }

    const webhookRoutingScript = provider['webhook_routing_script'];
    const handler = handlers[webhookRoutingScript];
    if (!handler) {
        return {
            content: null,
            statusCode: 204
        };
    }

    const res = await tracer.trace(`webhook.route.${integration.provider}`, async () => {
        try {
            return await handler(internalNango, integration, headers, body, rawBody, logContextGetter);
        } catch (err) {
            logger.error(`error processing incoming webhook for ${integration.unique_key} - `, err);
            if (err instanceof WebhookRoutingError) {
                return {
                    content: { error: err.message },
                    statusCode: 401
                };
            }
            return {
                content: { error: 'internal_error' },
                statusCode: 500
            };
        }
    });

    if (!res) {
        return {
            content: null,
            statusCode: 204
        };
    }

    // Only forward webhook if there was no error
    if (res.statusCode === 200) {
        const webhookBodyToForward = 'toForward' in res ? res.toForward : body;
        const connectionIds = 'connectionIds' in res ? (res.connectionIds as string[]) : [];

        const webhookSettings = await externalWebhookService.get(environment.id);

        await tracer.trace('webhook.forward', async () => {
            await forwardWebhook({
                integration,
                account,
                environment,
                webhookSettings,
                connectionIds,
                payload: webhookBodyToForward,
                webhookOriginalHeaders: headers,
                logContextGetter
            });
        });
    }

    return res;
}
