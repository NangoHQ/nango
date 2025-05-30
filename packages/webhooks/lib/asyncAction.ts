import type { LogContext } from '@nangohq/logs';
import { metrics } from '@nangohq/utils';

import { deliver, shouldSend } from './utils.js';

import type { AsyncActionResponse, DBEnvironment, DBExternalWebhook, NangoAsyncActionWebhookBody } from '@nangohq/types';

export const sendAsyncActionWebhook = async ({
    environment,
    connectionId,
    providerConfigKey,
    webhookSettings,
    payload,
    logCtx
}: {
    environment: DBEnvironment;
    connectionId: string;
    providerConfigKey: string;
    webhookSettings: DBExternalWebhook | null;
    payload: AsyncActionResponse;
    logCtx: LogContext;
}): Promise<void> => {
    if (!webhookSettings) {
        return;
    }

    if (!shouldSend({ success: true, type: 'async_action', webhookSettings })) {
        return;
    }

    const body: NangoAsyncActionWebhookBody = {
        type: 'async_action',
        from: 'nango',
        connectionId,
        providerConfigKey,
        payload: payload
    };

    const webhooks = [
        { url: webhookSettings.primary_url, type: 'webhook url' },
        { url: webhookSettings.secondary_url, type: 'secondary webhook url' }
    ].filter((webhook) => webhook.url) as { url: string; type: string }[];

    const result = await deliver({
        webhooks,
        body,
        webhookType: 'async_action',
        environment,
        logCtx
    });

    if (result.isOk()) {
        metrics.increment(metrics.Types.WEBHOOK_ASYNC_ACTION_SUCCESS);
    } else {
        metrics.increment(metrics.Types.WEBHOOK_ASYNC_ACTION_FAILED);
    }
};
