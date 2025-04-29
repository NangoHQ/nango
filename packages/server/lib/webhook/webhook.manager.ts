import tracer from 'dd-trace';

import { NangoError, externalWebhookService, getProvider } from '@nangohq/shared';
import type { Result } from '@nangohq/utils';
import { getLogger, Err } from '@nangohq/utils';
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

    const result: Result<WebhookResponse> = await tracer.trace(`webhook.route.${integration.provider}`, async () => {
        try {
            const handlerResult = await handler(internalNango, integration, headers, body, rawBody, logContextGetter);
            return handlerResult;
        } catch (err) {
            logger.error(`error processing incoming webhook for ${integration.unique_key} - `, err);
            return Err(err instanceof Error ? err : new Error(String(err)));
        }
    });

    if (result.isErr()) {
        const err = result.error;
        if (err instanceof NangoError) {
            return {
                content: { error: err.message },
                statusCode: err.status
            };
        }
        return {
            content: { error: 'internal_error' },
            statusCode: 500
        };
    }

    const res = result.value;
    if (!res) {
        return {
            content: null,
            statusCode: 204
        };
    }

    // Only forward webhook if there was no error
    if (res.statusCode === 200) {
        const webhookBodyToForward = 'toForward' in res ? res.toForward : body;
        const connectionIds = 'connectionIds' in res ? res.connectionIds : [];

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
