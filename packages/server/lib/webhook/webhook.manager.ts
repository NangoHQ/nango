import { externalWebhookService, configService, environmentService, telemetry, LogTypes, LogActionEnum } from '@nangohq/shared';
import { internalNango } from './internal-nango.js';
import { getLogger } from '@nangohq/utils';
import * as webhookHandlers from './index.js';
import type { WebhookHandlersMap, WebhookResponse } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';
import { forwardWebhook } from '@nangohq/webhooks';

const logger = getLogger('Webhook.Manager');

const handlers: WebhookHandlersMap = webhookHandlers as unknown as WebhookHandlersMap;

async function execute(
    environmentUuid: string,
    providerConfigKey: string,
    headers: Record<string, any>,
    body: any,
    rawBody: string,
    logContextGetter: LogContextGetter
): Promise<unknown> {
    if (!body) {
        return;
    }

    const integration = await configService.getProviderConfigByUuid(providerConfigKey, environmentUuid);

    if (!integration) {
        return;
    }

    const environmentAndAccountLookup = await environmentService.getAccountAndEnvironment({ environmentUuid: environmentUuid });

    if (!environmentAndAccountLookup) {
        return;
    }

    const template = configService.getTemplate(integration.provider);

    const { environment, account } = environmentAndAccountLookup;

    if (!template || !template['webhook_routing_script']) {
        return;
    }

    const webhookRoutingScript = template['webhook_routing_script'];
    const handler = handlers[webhookRoutingScript];

    if (!handler) {
        return;
    }

    let res: WebhookResponse = undefined;
    try {
        res = await handler(internalNango, integration, headers, body, rawBody, logContextGetter);
    } catch (e) {
        logger.error(`error processing incoming webhook for ${providerConfigKey} - `, e);

        await telemetry.log(LogTypes.INCOMING_WEBHOOK_FAILED_PROCESSING, 'Incoming webhook failed processing', LogActionEnum.WEBHOOK, {
            accountId: String(account.id),
            environmentId: String(integration.environment_id),
            provider: integration.provider,
            providerConfigKey: integration.unique_key,
            payload: JSON.stringify(body),
            error: String(e),
            level: 'error'
        });
    }

    const webhookBodyToForward = res?.parsedBody || body;
    const connectionIds = res?.connectionIds || [];

    const webhookSettings = await externalWebhookService.get(environment.id);

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

    await telemetry.log(LogTypes.INCOMING_WEBHOOK_PROCESSED_SUCCESSFULLY, 'Incoming webhook was processed successfully', LogActionEnum.WEBHOOK, {
        accountId: String(account.id),
        environmentId: String(integration.environment_id),
        provider: integration.provider,
        providerConfigKey: integration.unique_key,
        payload: JSON.stringify(webhookBodyToForward)
    });

    return res ? res.acknowledgementResponse : null;
}

export default execute;
