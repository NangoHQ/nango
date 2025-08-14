import tracer from 'dd-trace';

import { NangoError, externalWebhookService, getProvider } from '@nangohq/shared';
import { Err, getLogger } from '@nangohq/utils';
import { forwardWebhook } from '@nangohq/webhooks';

import * as webhookHandlers from './index.js';
import { InternalNango } from './internal-nango.js';

import type { WebhookHandlersMap, WebhookResponse } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';
import type { Config } from '@nangohq/shared';
import type { DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('Webhook.Manager');

const handlers: WebhookHandlersMap = webhookHandlers as unknown as WebhookHandlersMap;

export async function routeWebhook({
    environment,
    account,
    integration,
    headers,
    plan,
    body,
    rawBody,
    logContextGetter
}: {
    environment: DBEnvironment;
    account: DBTeam;
    integration: Config;
    plan?: DBPlan | undefined;
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

    const internalNango = new InternalNango({
        team: account,
        environment,
        plan,
        integration,
        logContextGetter
    });

    const result: Result<WebhookResponse> = await tracer.trace(`webhook.route.${integration.provider}`, async () => {
        try {
            const handlerResult = await handler(internalNango, headers, body, rawBody);
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

    // Only forward webhook if there was no error
    if (res.statusCode === 200 && ((plan && plan.has_webhooks_forward) || !plan)) {
        const webhookBodyToForward = 'toForward' in res ? res.toForward : body;
        const connectionIds = 'connectionIds' in res ? res.connectionIds : [];

        const webhookSettings = await externalWebhookService.get(environment.id);

        // Forward the webhook to the customer asynchronously to avoid provider timeouts.
        // Some providers stop sending webhooks if Nango doesn't respond quickly due to slow customer endpoints
        const forwardSpan = tracer.startSpan('webhook.forward');
        void forwardWebhook({
            integration,
            account,
            environment,
            webhookSettings,
            connectionIds,
            payload: webhookBodyToForward,
            webhookOriginalHeaders: headers,
            logContextGetter
        }).finally(() => forwardSpan.finish());
    }

    return res;
}
