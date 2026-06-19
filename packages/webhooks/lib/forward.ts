import { OtlpSpan } from '@nangohq/logs';
import { Err, getLogger, metrics, Ok } from '@nangohq/utils';

import { deliver, shouldSend } from './utils.js';

import type { LogContextGetter } from '@nangohq/logs';
import type { MeteredBytes } from '@nangohq/shared';
import type { DBAPISecret, DBEnvironment, DBExternalWebhook, DBTeam, IntegrationConfig, NangoForwardWebhookBody, Result } from '@nangohq/types';

const logger = getLogger('webhooks.forward');

export const forwardWebhook = async ({
    integration,
    account,
    environment,
    secret,
    webhookSettings,
    connectionIds,
    payload,
    webhookOriginalHeaders,
    logContextGetter,
    onBytes
}: {
    integration: IntegrationConfig;
    account: DBTeam;
    environment: DBEnvironment;
    secret: DBAPISecret['secret'];
    webhookSettings: DBExternalWebhook | null;
    connectionIds: string[];
    payload: Record<string, any> | null;
    webhookOriginalHeaders: Record<string, string>;
    logContextGetter: LogContextGetter;
    onBytes?: (bytes: MeteredBytes, connectionId: string) => void;
}): Promise<Result<{ results: { connectionId: string; success: boolean }[] }>> => {
    const safeOnBytes = (bytes: MeteredBytes, connectionId: string) => {
        try {
            onBytes?.(bytes, connectionId);
        } catch (err) {
            logger.error('onBytes callback failed', err);
        }
    };

    if (!webhookSettings) {
        return Ok({ results: [] });
    }
    if (!shouldSend({ success: true, type: 'forward', webhookSettings })) {
        return Ok({ results: [] });
    }
    if (!integration.forward_webhooks) {
        return Ok({ results: [] });
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
        const deliverBytes: MeteredBytes = { sent: 0, received: 0 };
        const result = await deliver({
            webhooks,
            body: payload,
            webhookType: 'forward',
            secret,
            logCtx,
            incomingHeaders: webhookOriginalHeaders,
            onBytes: (b) => {
                deliverBytes.sent += b.sent;
                deliverBytes.received += b.received;
            }
        });
        safeOnBytes(deliverBytes, 'unknown');

        if (result.isErr()) {
            metrics.increment(metrics.Types.WEBHOOK_INCOMING_FORWARDED_FAILED, 1, { accountId: account.id });
            await logCtx.failed();
            return Err(result.error);
        }

        metrics.increment(metrics.Types.WEBHOOK_INCOMING_FORWARDED_SUCCESS, 1, { accountId: account.id });
        await logCtx.success();
        return Ok({ results: [{ connectionId: 'unknown', success: true }] });
    }

    let success = true;
    const results: { connectionId: string; success: boolean }[] = [];
    for (const connectionId of connectionIds) {
        const deliverBytes: MeteredBytes = { sent: 0, received: 0 };
        const result = await deliver({
            webhooks,
            body: {
                ...body,
                connectionId
            },
            webhookType: 'forward',
            secret,
            logCtx,
            incomingHeaders: webhookOriginalHeaders,
            onBytes: (b) => {
                deliverBytes.sent += b.sent;
                deliverBytes.received += b.received;
            }
        });
        safeOnBytes(deliverBytes, connectionId);

        if (result.isOk()) {
            metrics.increment(metrics.Types.WEBHOOK_INCOMING_FORWARDED_SUCCESS, 1, { accountId: account.id });
            results.push({ connectionId, success: true });
        } else {
            metrics.increment(metrics.Types.WEBHOOK_INCOMING_FORWARDED_FAILED, 1, { accountId: account.id });
            success = false;
            results.push({ connectionId, success: false });
        }
    }

    if (success) {
        await logCtx.success();
    } else {
        await logCtx.failed();
    }
    return Ok({ results });
};
