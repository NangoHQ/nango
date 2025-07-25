import { OtlpSpan } from '@nangohq/logs';
import { metrics } from '@nangohq/utils';

import { deliver, shouldSend } from './utils.js';

import type { LogContextGetter } from '@nangohq/logs';
import type { DBEnvironment, DBExternalWebhook, DBTeam, IntegrationConfig, NangoForwardWebhookBody } from '@nangohq/types';

export const forwardWebhook = async ({
    integration,
    account,
    environment,
    webhookSettings,
    connectionIds,
    payload,
    webhookOriginalHeaders,
    logContextGetter
}: {
    integration: IntegrationConfig;
    account: DBTeam;
    environment: DBEnvironment;
    webhookSettings: DBExternalWebhook | null;
    connectionIds: string[];
    payload: Record<string, any> | null;
    webhookOriginalHeaders: Record<string, string>;
    logContextGetter: LogContextGetter;
}): Promise<void> => {
    if (!webhookSettings) {
        return;
    }
    if (!shouldSend({ success: true, type: 'forward', webhookSettings })) {
        return;
    }
    if (!integration.forward_webhooks) {
        return;
    }

    const logCtx = await logContextGetter.create(
        { operation: { type: 'webhook', action: 'forward' }, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() },
        {
            account,
            environment,
            integration: { id: integration.id!, name: integration.unique_key, provider: integration.provider }
        }
    );
    logCtx.attachSpan(new OtlpSpan(logCtx.operation));

    const body: NangoForwardWebhookBody = {
        from: integration.provider,
        providerConfigKey: integration.unique_key,
        type: 'forward',
        payload: payload
    };

    const webhooks = [
        { url: webhookSettings.primary_url, type: 'webhook url' },
        { url: webhookSettings.secondary_url, type: 'secondary webhook url' }
    ].filter((webhook) => webhook.url) as { url: string; type: string }[];

    if (!connectionIds || connectionIds.length === 0) {
        const result = await deliver({
            webhooks,
            body: payload,
            webhookType: 'forward',
            environment,
            logCtx,
            incomingHeaders: webhookOriginalHeaders
        });

        if (result.isOk()) {
            metrics.increment(metrics.Types.WEBHOOK_INCOMING_FORWARDED_SUCCESS, 1, { accountId: account.id });
            await logCtx.success();
        } else {
            metrics.increment(metrics.Types.WEBHOOK_INCOMING_FORWARDED_FAILED, 1, { accountId: account.id });
            await logCtx.failed();
        }

        return;
    }

    let success = true;
    for (const connectionId of connectionIds) {
        const result = await deliver({
            webhooks,
            body: {
                ...body,
                connectionId
            },
            webhookType: 'forward',
            environment,
            logCtx,
            incomingHeaders: webhookOriginalHeaders
        });

        if (result.isOk()) {
            metrics.increment(metrics.Types.WEBHOOK_INCOMING_FORWARDED_SUCCESS, 1, { accountId: account.id });
        } else {
            metrics.increment(metrics.Types.WEBHOOK_INCOMING_FORWARDED_FAILED, 1, { accountId: account.id });
            success = false;
        }
    }

    if (success) {
        await logCtx.success();
    } else {
        await logCtx.failed();
    }
};
