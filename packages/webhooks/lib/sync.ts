import type {
    Connection,
    Environment,
    SyncResult,
    ErrorPayload,
    SyncType,
    ExternalWebhook,
    NangoSyncWebhookBody,
    NangoSyncWebhookBodyBase
} from '@nangohq/types';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import type { LogContext } from '@nangohq/logs';
import { deliver, shouldSend } from './utils.js';

dayjs.extend(utc);

export const sendSync = async ({
    connection,
    environment,
    webhookSettings,
    syncName,
    model,
    now,
    responseResults,
    success,
    operation,
    error,
    logCtx
}: {
    connection: Connection | Pick<Connection, 'connection_id' | 'provider_config_key'>;
    environment: Environment;
    webhookSettings: ExternalWebhook | null;
    syncName: string;
    model: string;
    now: Date | undefined;
    operation: SyncType;
    error?: ErrorPayload;
    responseResults?: SyncResult;
    success: boolean;
    logCtx?: LogContext | undefined;
} & ({ success: true; responseResults: SyncResult } | { success: false; error: ErrorPayload })): Promise<void> => {
    if (!webhookSettings) {
        return;
    }

    if (!shouldSend({ success, type: 'sync', webhookSettings, operation })) {
        return;
    }

    const bodyBase: NangoSyncWebhookBodyBase = {
        from: 'nango',
        type: 'sync',
        connectionId: connection.connection_id,
        providerConfigKey: connection.provider_config_key,
        syncName,
        model,
        syncType: operation
    };
    let finalBody: NangoSyncWebhookBody;

    let endingMessage = '';

    if (success) {
        const noChanges =
            responseResults?.added === 0 && responseResults?.updated === 0 && (responseResults.deleted === 0 || responseResults.deleted === undefined);

        if (!webhookSettings.on_sync_completion_always && noChanges) {
            await logCtx?.info('There were no added, updated, or deleted results. No webhook sent, as per your environment settings');

            return;
        }

        finalBody = {
            ...bodyBase,
            success: true,
            responseResults: {
                added: responseResults.added,
                updated: responseResults.updated,
                deleted: 0
            },
            modifiedAfter: dayjs(now).toDate().toISOString(),
            queryTimeStamp: operation !== 'INITIAL' ? (now as unknown as string) : null
        };

        if (responseResults.deleted && responseResults.deleted > 0) {
            finalBody.responseResults.deleted = responseResults.deleted;
        }
        endingMessage = noChanges ? 'with no data changes as per your environment settings.' : 'with data changes.';
    } else {
        finalBody = {
            ...bodyBase,
            success: false,
            error: error,
            startedAt: dayjs(now).toDate().toISOString(),
            failedAt: new Date().toISOString()
        };
    }

    const webhooks = [
        { url: webhookSettings.primary_url, type: 'webhook url' },
        { url: webhookSettings.secondary_url, type: 'secondary webhook url' }
    ].filter((webhook) => webhook.url) as { url: string; type: string }[];

    await deliver({
        webhooks,
        body: finalBody,
        webhookType: 'sync',
        endingMessage: success ? endingMessage : '',
        environment,
        logCtx
    });
};
