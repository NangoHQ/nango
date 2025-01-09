import type { NangoForwardWebhookBody, ExternalWebhook, IntegrationConfig, DBTeam, DBEnvironment } from '@nangohq/types';
import type { LogContextGetter } from '@nangohq/logs';
import { deliver, shouldSend } from './utils.js';

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
    webhookSettings: ExternalWebhook | null;
    connectionIds: string[];
    payload: Record<string, any> | null;
    webhookOriginalHeaders: Record<string, string>;
    logContextGetter: LogContextGetter;
}): Promise<void> => {
    if (!webhookSettings) {
        return;
    }

    if (!shouldSend({ success: true, type: 'forward', webhookSettings, operation: 'incoming_webhook' })) {
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
            await logCtx.success();
        } else {
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

        if (result.isErr()) {
            success = false;
        }
    }

    if (success) {
        await logCtx.success();
    } else {
        await logCtx.failed();
    }
};
