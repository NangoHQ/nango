import axios from 'axios';
import type { SyncType } from '../models/Sync';
import type { NangoConnection } from '../models/Connection';
import type { SyncResult, NangoSyncWebhookBody } from '../models/Sync';
import environmentService from './environment.service.js';
import { createActivityLogMessage } from './activity/activity.service.js';

class WebhookService {
    async sendUpdate(
        nangoConnection: NangoConnection,
        syncName: string,
        model: string,
        responseResults: SyncResult,
        syncType: SyncType,
        now: Date | undefined,
        activityLogId: number
    ) {
        const webhookUrl = await environmentService.getWebhookUrl(nangoConnection.environment_id);

        if (!webhookUrl) {
            return;
        }

        if (responseResults.added === 0 && responseResults.updated === 0) {
            await createActivityLogMessage({
                level: 'info',
                activity_log_id: activityLogId,
                content: `There were no added or updated results so a webhook with changes was not sent.`,
                timestamp: Date.now()
            });

            return;
        }

        const body: NangoSyncWebhookBody = {
            connectionId: nangoConnection.connection_id,
            providerConfigKey: nangoConnection.provider_config_key,
            syncName,
            model,
            responseResults: {
                added: responseResults.added,
                updated: responseResults.updated
            },
            syncType,
            queryTimeStamp: now as unknown as string
        };

        if (responseResults.deleted && responseResults.deleted > 0) {
            body.responseResults.deleted = responseResults.deleted;
        }

        try {
            const response = await axios.post(webhookUrl, body);
            if (response.status >= 200 && response.status < 300) {
                await createActivityLogMessage({
                    level: 'info',
                    activity_log_id: activityLogId,
                    content: `Webhook sent successfully and received with a ${
                        response.status
                    } response code to ${webhookUrl} with the following data: ${JSON.stringify(body, null, 2)}`,
                    timestamp: Date.now()
                });
            } else {
                await createActivityLogMessage({
                    level: 'error',
                    activity_log_id: activityLogId,
                    content: `Webhook sent successfully to ${webhookUrl} with the following data: ${JSON.stringify(body, null, 2)} but received a ${
                        response.status
                    } response code. Please send a 200 on successful receipt.`,
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
