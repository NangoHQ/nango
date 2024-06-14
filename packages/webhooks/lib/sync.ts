import type { Connection, Environment, SyncResult, ErrorPayload, SyncType } from '@nangohq/types';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import type { LogContext } from '@nangohq/logs';
import type { NangoSyncWebhookBody } from './types.js';
import { deliver, shouldSend } from './utils.js';
import { WebhookType } from './enums.js';

dayjs.extend(utc);

export const sendSync = async ({
    connection,
    environment,
    syncName,
    model,
    now,
    responseResults,
    syncType,
    error,
    activityLogId,
    logCtx
}: {
    connection: Connection | Pick<Connection, 'connection_id' | 'provider_config_key'>;
    environment: Environment;
    syncName: string;
    model: string;
    now: Date | undefined;
    responseResults?: SyncResult;
    syncType: SyncType;
    error?: ErrorPayload;
    activityLogId: number | null;
    logCtx?: LogContext | undefined;
}): Promise<void> => {
    if (!shouldSend(environment, 'sync')) {
        return;
    }

    const noChanges =
        responseResults?.added === 0 && responseResults?.updated === 0 && (responseResults.deleted === 0 || responseResults.deleted === undefined);

    if (!environment.always_send_webhook && noChanges) {
        await logCtx?.info('There were no added, updated, or deleted results. No webhook sent, as per your environment settings');

        return;
    }

    const success = typeof error === 'undefined';

    const body: NangoSyncWebhookBody = {
        from: 'nango',
        type: WebhookType.SYNC,
        connectionId: connection.connection_id,
        providerConfigKey: connection.provider_config_key,
        syncName,
        success,
        model,
        syncType
    };

    if (success) {
        body.queryTimeStamp = null;
        body.modifiedAfter = dayjs(now).toDate().toISOString();
        body.queryTimeStamp = syncType !== 'INITIAL' ? (now as unknown as string) : null;
    }

    // TODO send when the failed sync update is opt in
    if (!success) {
        return;
    }

    if (responseResults) {
        body.responseResults = {
            added: responseResults.added,
            updated: responseResults.updated,
            deleted: 0
        };
    }

    if (!success && error) {
        body.error = error;
        body.startedAt = dayjs(now).toDate().toISOString();
        body.failedAt = new Date().toISOString();
    }

    if (responseResults && body.responseResults && responseResults.deleted && responseResults.deleted > 0) {
        body.responseResults.deleted = responseResults.deleted;
    }

    const endingMessage = noChanges ? 'with no data changes as per your environment settings.' : 'with data changes.';

    const webhooks = [
        { url: environment.webhook_url!, type: 'webhook url' },
        { url: environment.webhook_url_secondary!, type: 'secondary webhook url' }
    ].filter((webhook) => webhook.url) as { url: string; type: string }[];

    await deliver({
        webhooks,
        body,
        webhookType: 'sync',
        activityLogId,
        endingMessage: success ? endingMessage : '',
        environment,
        logCtx
    });
};
