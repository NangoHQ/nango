import axios, { AxiosError } from 'axios';
import { backOff } from 'exponential-backoff';
import { SyncType } from '../models/Sync.js';
import type { NangoConnection } from '../models/Connection';
import type { ServiceResponse } from '../models/Generic';
import type { SyncResult, NangoSyncWebhookBody } from '../models/Sync';
import environmentService from './environment.service.js';
import { LogActionEnum, LogLevel } from '../models/Activity.js';
import { updateSuccess as updateSuccessActivityLog, createActivityLogMessage, createActivityLogAndLogMessage } from './activity/activity.service.js';
import { getBaseUrl } from '../utils/utils.js';
import connectionService from './connection.service.js';
import accountService from './account.service.js';
import SyncClient from '../clients/sync.client.js';

const RETRY_ATTEMPTS = 10;

class NotificationService {
    private retry = async (activityLogId: number, environment_id: number, error: AxiosError, attemptNumber: number): Promise<boolean> => {
        if (error?.response && (error?.response?.status < 200 || error?.response?.status >= 300)) {
            const content = `Webhook response received an ${
                error?.response?.status || error?.code
            } error, retrying with exponential backoffs for ${attemptNumber} out of ${RETRY_ATTEMPTS} times`;

            await createActivityLogMessage({
                level: 'error',
                environment_id,
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content
            });

            return true;
        }

        return false;
    };

    async sendWebhook(
        nangoConnection: NangoConnection,
        syncName: string,
        model: string,
        responseResults: SyncResult,
        syncType: SyncType,
        now: Date | undefined,
        activityLogId: number,
        environment_id: number
    ) {
        const webhookInfo = await environmentService.getWebhookInfo(nangoConnection.environment_id);

        if (!webhookInfo || !webhookInfo.webhook_url) {
            return;
        }

        const { webhook_url: webhookUrl, always_send_webhook: alwaysSendWebhook } = webhookInfo;

        if (!alwaysSendWebhook && responseResults.added === 0 && responseResults.updated === 0 && responseResults.deleted === 0) {
            await createActivityLogMessage({
                level: 'info',
                environment_id,
                activity_log_id: activityLogId,
                content: `There were no added, updated, or deleted results so a webhook with changes was not sent.`,
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
                updated: responseResults.updated,
                deleted: 0
            },
            syncType,
            queryTimeStamp: now as unknown as string
        };

        if (syncType === SyncType.INITIAL) {
            body.queryTimeStamp = null;
        }

        if (responseResults.deleted && responseResults.deleted > 0) {
            body.responseResults.deleted = responseResults.deleted;
        }

        try {
            const response = await backOff(
                () => {
                    return axios.post(webhookUrl, body);
                },
                { numOfAttempts: RETRY_ATTEMPTS, retry: this.retry.bind(this, activityLogId, environment_id) }
            );

            if (response.status >= 200 && response.status < 300) {
                await createActivityLogMessage({
                    level: 'info',
                    environment_id,
                    activity_log_id: activityLogId,
                    content: `Webhook sent successfully and received with a ${
                        response.status
                    } response code to ${webhookUrl} with the following data: ${JSON.stringify(body, null, 2)}`,
                    timestamp: Date.now()
                });
            } else {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id,
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
                environment_id,
                activity_log_id: activityLogId,
                content: `Webhook failed to send to ${webhookUrl}. The error was: ${errorMessage}`,
                timestamp: Date.now()
            });
        }
    }

    async reportFailure(
        nangoConnection: NangoConnection,
        syncName: string,
        syncType: SyncType,
        originalActivityLogId: number,
        environment_id: number,
        provider: string
    ) {
        const slackNotificationsEnabled = await environmentService.getSlackNotificationsEnabled(nangoConnection.environment_id);

        if (!slackNotificationsEnabled) {
            return;
        }

        const actionName = 'flow-result-notifier-action';

        if (syncName === actionName) {
            return;
        }

        const envName = await environmentService.getEnvironmentName(nangoConnection.environment_id);
        const payload = {
            title: `${syncType} Failure`,
            content: `The ${syncType} sync for ${syncName} failed. Please check the logs (${getBaseUrl()}/activity?env=${envName}&activity_log_id=${originalActivityLogId}) for more information.`,
            connectionCount: 1, // TODO
            status: 'open',
            name: syncName,
            providerConfigKey: nangoConnection.provider_config_key,
            provider
        };

        const syncClient = await SyncClient.getInstance();

        const integrationKey = process.env['NANGO_SLACK_INTEGRATION_KEY'] || 'slack';
        const nangoAdminUUID = process.env['NANGO_ADMIN_UUID'];
        const env = 'prod';
        const info = await accountService.getAccountAndEnvironmentIdByUUID(nangoAdminUUID as string, env);
        const [nangoAdminConnection] = await connectionService.getConnectionsByEnvironmentAndConfig(info?.environmentId as number, integrationKey);

        if (!nangoAdminConnection) {
            return;
        }

        const { success: actionSuccess, error: actionError } = (await syncClient?.triggerAction(
            nangoAdminConnection,
            actionName,
            payload,
            originalActivityLogId,
            environment_id,
            false
        )) as ServiceResponse;

        const log = {
            level: 'info' as LogLevel,
            success: true,
            action: LogActionEnum.ACTION,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: nangoAdminConnection?.connection_id as string,
            provider_config_key: nangoAdminConnection?.provider_config_key as string,
            provider: integrationKey,
            environment_id: info?.environmentId as number,
            operation_name: actionName
        };

        const content = actionSuccess
            ? `The action ${actionName} was successfully triggered for the ${syncType} ${syncName} for environment ${info?.environmentId} for account ${info?.accountId}.`
            : `The action ${actionName} failed to trigger for the ${syncType} ${syncName} with the error: ${actionError} for environment ${info?.environmentId} for account ${info?.accountId}.`;

        const activityLogId = await createActivityLogAndLogMessage(log, {
            level: actionSuccess ? 'info' : 'error',
            environment_id: info?.environmentId as number as number,
            timestamp: Date.now(),
            content
        });

        await updateSuccessActivityLog(activityLogId as number, actionSuccess);
    }
}

export default new NotificationService();
