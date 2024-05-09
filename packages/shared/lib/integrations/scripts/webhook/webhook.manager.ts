import configService from '../../../services/config.service.js';
import environmentService from '../../../services/environment.service.js';
import webhookService from '../../../services/notification/webhook.service.js';
import telemetry, { LogTypes } from '../../../utils/telemetry.js';
import { LogActionEnum } from '../../../models/Activity.js';
import { internalNango } from './internal-nango.js';
import { getLogger } from '@nangohq/utils';

import * as webhookHandlers from './index.js';
import type { WebhookHandlersMap, WebhookResponse } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';

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

    const account = await environmentService.getAccountFromEnvironment(integration.environment_id);
    if (!account) {
        return;
    }

    const handler = handlers[`${integration.provider.replace(/-/g, '')}Webhook`];
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

    await webhookService.forward({ integration, account, connectionIds, payload: webhookBodyToForward, webhookOriginalHeaders: headers, logContextGetter });

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
