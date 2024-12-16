import type { Config } from '@nangohq/shared';
import { externalWebhookService, telemetry, LogTypes, LogActionEnum, getProvider } from '@nangohq/shared';
import { internalNango } from './internal-nango.js';
import { getLogger } from '@nangohq/utils';
import * as webhookHandlers from './index.js';
import type { WebhookHandlersMap } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';
import { forwardWebhook } from '@nangohq/webhooks';
import type { DBEnvironment, DBTeam } from '@nangohq/types';
import tracer from 'dd-trace';

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

            await telemetry.log(LogTypes.INCOMING_WEBHOOK_FAILED_PROCESSING, 'Incoming webhook failed processing', LogActionEnum.WEBHOOK, {
                accountId: String(account.id),
                environmentId: String(integration.environment_id),
                provider: integration.provider,
                providerConfigKey: integration.unique_key,
                payload: JSON.stringify(body),
                error: String(err),
                level: 'error'
            });
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

    await telemetry.log(LogTypes.INCOMING_WEBHOOK_PROCESSED_SUCCESSFULLY, 'Incoming webhook was processed successfully', LogActionEnum.WEBHOOK, {
        accountId: String(account.id),
        environmentId: String(integration.environment_id),
        provider: integration.provider,
        providerConfigKey: integration.unique_key,
        payload: JSON.stringify(webhookBodyToForward)
    });

    return res ? res.acknowledgementResponse : null;
}
