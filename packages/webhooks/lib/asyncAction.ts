import { metrics } from '@nangohq/utils';

import { deliver, resolveWebhookSettings, shouldSend } from './utils.js';

import type { LogContext } from '@nangohq/logs';
import type { AsyncActionResponse, ConnectionOverrides, DBAPISecret, DBExternalWebhook, NangoAsyncActionWebhookBody } from '@nangohq/types';

export const sendAsyncActionWebhook = async ({
    secret,
    connectionId,
    providerConfigKey,
    webhookSettings,
    overrides,
    payload,
    logCtx
}: {
    secret: DBAPISecret['secret'];
    connectionId: string;
    providerConfigKey: string;
    webhookSettings: DBExternalWebhook | null;
    overrides: ConnectionOverrides | null;
    payload: AsyncActionResponse;
    logCtx: LogContext;
}): Promise<void> => {
    if (!webhookSettings) {
        return;
    }

    const settings = resolveWebhookSettings(webhookSettings, overrides);

    if (!shouldSend({ success: true, type: 'async_action', webhookSettings: settings })) {
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
        { url: settings.primary_url, type: 'webhook url' },
        { url: settings.secondary_url, type: 'secondary webhook url' }
    ].filter((webhook) => webhook.url) as { url: string; type: string }[];

    const result = await deliver({
        webhooks,
        body,
        webhookType: 'async_action',
        secret,
        logCtx
    });

    if (result.isOk()) {
        metrics.increment(metrics.Types.WEBHOOK_ASYNC_ACTION_SUCCESS);
    } else {
        metrics.increment(metrics.Types.WEBHOOK_ASYNC_ACTION_FAILED);
    }
};
