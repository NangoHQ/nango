import { OtlpSpan } from '@nangohq/logs';
import { Err, Ok, metrics } from '@nangohq/utils';

import { deliver, shouldSend } from './utils.js';

import type { LogContextGetter } from '@nangohq/logs';
import type { DBEnvironment, DBExternalWebhook, DBTeam, IntegrationConfig, NangoForwardWebhookBody, Result } from '@nangohq/types';

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
}): Promise<Result<{ forwarded: number }>> => {
    if (!webhookSettings) {
        return Ok({ forwarded: 0 });
    }
    if (!shouldSend({ success: true, type: 'forward', webhookSettings })) {
        return Ok({ forwarded: 0 });
    }
    if (!integration.forward_webhooks) {
        return Ok({ forwarded: 0 });
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

        if (result.isErr()) {
            metrics.increment(metrics.Types.WEBHOOK_INCOMING_FORWARDED_FAILED, 1, { accountId: account.id });
            await logCtx.failed();
            return Err(result.error);
        }

        metrics.increment(metrics.Types.WEBHOOK_INCOMING_FORWARDED_SUCCESS, 1, { accountId: account.id });
        await logCtx.success();
        return Ok({ forwarded: 1 });
    }

    let success = true;
    let forwarded = 0;
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
            forwarded += 1;
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
    return Ok({ forwarded });
};
