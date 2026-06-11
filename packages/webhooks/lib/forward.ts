import { OtlpSpan } from '@nangohq/logs';
import { Err, Ok, getLogger, metrics } from '@nangohq/utils';

const logger = getLogger('webhooks.forward');

import { deliver, shouldSend } from './utils.js';

import type { LogContextGetter } from '@nangohq/logs';
import type { MeteredBytes } from '@nangohq/shared';
import type { DBAPISecret, DBEnvironment, DBExternalWebhook, DBTeam, IntegrationConfig, NangoForwardWebhookBody, Result } from '@nangohq/types';

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
    onBytes?: (bytes: MeteredBytes) => void;
}): Promise<Result<{ forwarded: number }>> => {
    const totalBytes: MeteredBytes = { sent: 0, received: 0 };
    const accumulateBytes = (hop: MeteredBytes) => {
        totalBytes.sent += hop.sent;
        totalBytes.received += hop.received;
    };

    try {
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
                secret,
                logCtx,
                incomingHeaders: webhookOriginalHeaders,
                onBytes: accumulateBytes
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
                secret,
                logCtx,
                incomingHeaders: webhookOriginalHeaders,
                onBytes: accumulateBytes
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
    } finally {
        try {
            onBytes?.(totalBytes);
        } catch (err) {
            logger.error('onBytes callback failed', err);
        }
    }
};
