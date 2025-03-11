import type {
    SyncResult,
    ErrorPayload,
    SyncOperationType,
    DBExternalWebhook,
    NangoSyncWebhookBody,
    NangoSyncWebhookBodyBase,
    DBEnvironment,
    DBTeam,
    DBSyncConfig,
    IntegrationConfig,
    ConnectionJobs
} from '@nangohq/types';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { logContextGetter, OtlpSpan } from '@nangohq/logs';
import { deliver, shouldSend } from './utils.js';
import { metrics, Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';

dayjs.extend(utc);

export const sendSync = async ({
    connection,
    environment,
    account,
    providerConfig,
    webhookSettings,
    syncConfig,
    syncVariant,
    model,
    now,
    responseResults,
    success,
    operation,
    error
}: {
    connection: ConnectionJobs;
    environment: Pick<DBEnvironment, 'id' | 'name' | 'secret_key'>;
    account: Pick<DBTeam, 'id' | 'name'>;
    providerConfig: IntegrationConfig;
    webhookSettings: DBExternalWebhook | null;
    syncConfig: Pick<DBSyncConfig, 'id' | 'sync_name' | 'version'>;
    syncVariant: string;
    model: string;
    now: Date | undefined;
    operation: SyncOperationType;
    error?: ErrorPayload;
    responseResults?: SyncResult;
    success: boolean;
} & ({ success: true; responseResults: SyncResult } | { success: false; error: ErrorPayload })): Promise<Result<void>> => {
    if (!webhookSettings) {
        return Ok(undefined);
    }

    if (!shouldSend({ success, type: 'sync', webhookSettings, operation })) {
        return Ok(undefined);
    }

    const logCtx = await logContextGetter.create(
        { operation: { type: 'webhook', action: 'sync' } },
        {
            account,
            environment,
            integration: { id: providerConfig.id!, name: providerConfig.unique_key, provider: providerConfig.provider },
            connection: { id: connection.id, name: connection.connection_id },
            syncConfig: { id: syncConfig.id, name: syncConfig.sync_name },
            meta: { scriptVersion: syncConfig.version, syncVariant, model }
        }
    );
    logCtx.attachSpan(new OtlpSpan(logCtx.operation));

    const bodyBase: NangoSyncWebhookBodyBase = {
        from: 'nango',
        type: 'sync',
        connectionId: connection.connection_id,
        providerConfigKey: connection.provider_config_key,
        syncName: syncConfig.sync_name,
        syncVariant,
        model,
        // For backward compatibility reason we are sending the syncType as INITIAL instead of FULL
        syncType: operation === 'FULL' ? 'INITIAL' : operation
    };
    let finalBody: NangoSyncWebhookBody;

    let endingMessage = '';

    if (success) {
        const noChanges =
            responseResults?.added === 0 && responseResults?.updated === 0 && (responseResults.deleted === 0 || responseResults.deleted === undefined);

        if (!webhookSettings.on_sync_completion_always && noChanges) {
            void logCtx.info(`There were no added, updated, or deleted results for model ${model}. No webhook sent, as per your environment settings`);
            await logCtx.success();

            return Ok(undefined);
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
            queryTimeStamp: now as unknown as string // Deprecated
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
        { url: webhookSettings.primary_url, type: 'primary' },
        { url: webhookSettings.secondary_url, type: 'secondary' }
    ].filter((webhook) => webhook.url) as { url: string; type: string }[];

    const result = await deliver({
        webhooks,
        body: finalBody,
        webhookType: 'sync',
        endingMessage: success ? endingMessage : '',
        environment,
        logCtx
    });

    if (result.isErr()) {
        metrics.increment(metrics.Types.WEBHOOK_OUTGOING_FAILED, 1, { type: 'sync', operation });
        await logCtx.failed();
    } else {
        metrics.increment(metrics.Types.WEBHOOK_OUTGOING_SUCCESS, 1, { type: 'sync', operation });
        await logCtx.success();
    }

    return result;
};
