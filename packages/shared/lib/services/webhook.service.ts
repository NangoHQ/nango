import axios from 'axios';
import type { SyncType } from '../models/Sync';
import type { NangoConnection } from '../models/Connection';
import type { SyncResult, SyncWebhookBody } from '../models/Sync';
import accountService from './account.service.js';
import { createActivityLogMessage } from './activity.service.js';

class WebhookService {
    async sendUpdate(
        nangoConnection: NangoConnection,
        syncName: string,
        models: string[],
        responseResults: SyncResult,
        syncType: SyncType,
        now: string,
        activityLogId: number
    ) {
        if (responseResults.added === 0 && responseResults.updated === 0) {
            return;
        }

        const webhookUrl = await accountService.getWebhookUrl(nangoConnection.account_id);

        if (!webhookUrl) {
            return;
        }

        const body: SyncWebhookBody = {
            connectionId: nangoConnection.connection_id,
            providerConfigKey: nangoConnection.provider_config_key,
            syncName,
            models,
            responseResults: {
                added: responseResults.added,
                updated: responseResults.updated
            },
            syncType,
            queryTimeStamp: now
        };

        try {
            const response = await axios.post(webhookUrl, body);
            if (response.status === 200) {
                await createActivityLogMessage({
                    level: 'info',
                    activity_log_id: activityLogId,
                    content: `Webhook sent successfully to ${webhookUrl} with the following data: ${JSON.stringify(body, null, 2)}`,
                    timestamp: Date.now()
                });
            }
        } catch (e) {
            const errorMessage = JSON.stringify(e, ['message', 'name', 'stack'], 2);

            await createActivityLogMessage({
                level: 'error',
                activity_log_id: activityLogId,
                content: `Webhook failed to send to ${webhookUrl}. The error was: ${errorMessage}`,
                timestamp: Date.now()
            });
        }
    }
}

export default new WebhookService();
