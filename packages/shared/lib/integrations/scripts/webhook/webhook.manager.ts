import configService from '../../../services/config.service.js';
import type { Config as ProviderConfig } from './../../../models/Provider.js';
import environmentService from '../../../services/environment.service.js';
import webhookService from '../../../services/notification/webhook.service.js';
import metricsManager, { MetricTypes } from '../../../utils/metrics.manager.js';
import { LogActionEnum } from '../../../models/Activity.js';
import { internalNango, InternalNango } from './internal-nango.js';

import * as webhookHandlers from './index.js';

interface WebhookHandler {
    (internalNango: InternalNango, integration: ProviderConfig, headers: Record<string, any>, body: any): Promise<void | WebhookResponse>;
}

export interface WebhookResponse {
    acknowledgementResponse?: unknown;
    parsedBody?: unknown;
}

type WebhookHandlersMap = { [key: string]: WebhookHandler };

const handlers: WebhookHandlersMap = webhookHandlers as unknown as WebhookHandlersMap;

async function execute(environmentUuid: string, providerConfigKey: string, headers: Record<string, any>, body: any): Promise<void | any> {
    if (!body) {
        return;
    }

    const provider = await configService.getProviderName(providerConfigKey);
    const integration = await configService.getProviderConfigByUuid(providerConfigKey, environmentUuid);

    if (!provider || !integration) {
        return;
    }

    const accountId = await environmentService.getAccountIdFromEnvironment(integration.environment_id);

    const handler = handlers[`${provider.replace(/-/g, '')}Webhook`];

    let res: WebhookResponse | null | void = null;

    try {
        if (handler) {
            res = await handler(internalNango, integration, headers, body);
        }
    } catch (e) {
        await metricsManager.capture(MetricTypes.INCOMING_WEBHOOK_FAILED_PROCESSING, 'Incoming webhook failed processing', LogActionEnum.WEBHOOK, {
            accountId: String(accountId),
            environmentId: String(integration.environment_id),
            provider: integration.provider,
            providerConfigKey: integration.unique_key,
            payload: JSON.stringify(body),
            error: String(e)
        });
    }

    const webhookBodyToForward = res?.parsedBody || body;

    await webhookService.forward(integration.environment_id, providerConfigKey, provider, webhookBodyToForward, headers);

    await metricsManager.capture(MetricTypes.INCOMING_WEBHOOK_PROCESSED_SUCCESSFULLY, 'Incoming webhook was processed successfully', LogActionEnum.WEBHOOK, {
        accountId: String(accountId),
        environmentId: String(integration.environment_id),
        provider: integration.provider,
        providerConfigKey: integration.unique_key,
        payload: JSON.stringify(webhookBodyToForward)
    });

    if (res) {
        return res.acknowledgementResponse;
    }
}

export default execute;
