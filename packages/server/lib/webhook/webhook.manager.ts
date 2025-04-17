import tracer from 'dd-trace';

import { externalWebhookService, getProvider } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';
import { forwardWebhook } from '@nangohq/webhooks';

import * as webhookHandlers from './index.js';
import { internalNango } from './internal-nango.js';

import type { WebhookHandlersMap } from './types.js';
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
}): Promise<unknown> {
    if (!body) {
        return;
    }

    const provider = getProvider(integration.provider);
    if (!provider || !provider['webhook_routing_script']) {
        return;
    }

    const webhookRoutingScript = provider['webhook_routing_script'];
    const handler = handlers[webhookRoutingScript];
    if (!handler) {
        return;
    }

    const res = await tracer.trace(`webhook.route.${integration.provider}`, async () => {
        try {
            return await handler(internalNango, integration, headers, body, rawBody, logContextGetter);
        } catch (err) {
            logger.error(`error processing incoming webhook for ${integration.unique_key} - `, err);
        }
        return null;
    });

    const webhookBodyToForward = res?.parsedBody || body;
    const connectionIds = res?.connectionIds || [];

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

    return res ? { acknowledgementResponse: res.acknowledgementResponse, statusCode: res.statusCode } : null;
}
