import axios, { AxiosError } from 'axios';
import { backOff } from 'exponential-backoff';
import crypto from 'crypto';
import { SyncType } from '../../models/Sync.js';
import type { NangoConnection, RecentlyCreatedConnection } from '../../models/Connection.js';
import type { Environment } from '../../models/Environment';
import { LogActionEnum, LogLevel } from '../../models/Activity.js';
import type { SyncResult } from '../../models/Sync';
import { WebhookType, NangoSyncWebhookBody, NangoAuthWebhookBody } from '../../models/Webhook.js';
import environmentService from '../environment.service.js';
import { createActivityLog, createActivityLogMessage, createActivityLogMessageAndEnd } from '../activity/activity.service.js';

const RETRY_ATTEMPTS = 10;

const NON_FORWARDABLE_HEADERS = [
    'host',
    'authorization',
    'connection',
    'keep-alive',
    'content-length',
    'content-encoding',
    'cookie',
    'set-cookie',
    'referer',
    'user-agent',
    'sec-',
    'proxy-',
    'www-authenticate',
    'server'
];

class WebhookService {
    private retry = async (activityLogId: number | null, environment_id: number, error: AxiosError, attemptNumber: number): Promise<boolean> => {
        if (error?.response && (error?.response?.status < 200 || error?.response?.status >= 300)) {
            const content = `Webhook response received an ${
                error?.response?.status || error?.code
            } error, retrying with exponential backoffs for ${attemptNumber} out of ${RETRY_ATTEMPTS} times`;

            if (activityLogId) {
                await createActivityLogMessage(
                    {
                        level: 'error',
                        environment_id,
                        activity_log_id: activityLogId,
                        timestamp: Date.now(),
                        content
                    },
                    false
                );
            }

            return true;
        }

        return false;
    };

    private getSignatureHeader = (secret: string, payload: unknown): Record<string, string> => {
        const combinedSignature = `${secret}${JSON.stringify(payload)}`;
        const createdHash = crypto.createHash('sha256').update(combinedSignature).digest('hex');

        return {
            'X-Nango-Signature': createdHash
        };
    };

    private filterHeaders = (headers: Record<string, string>): Record<string, string> => {
        const filteredHeaders: Record<string, string> = {};

        for (const [key, value] of Object.entries(headers)) {
            if (NON_FORWARDABLE_HEADERS.some((header) => key.toLowerCase().startsWith(header))) {
                continue;
            }

            filteredHeaders[key] = value;
        }

        return filteredHeaders;
    };

    async shouldSendWebhook(
        environment_id: number,
        options?: { auth?: boolean; forward?: boolean }
    ): Promise<{ send: boolean; environmentInfo: Environment | null }> {
        const environmentInfo = await environmentService.getById(environment_id);
        const hasWebhookUrl = environmentInfo?.webhook_url;

        if (options?.forward && hasWebhookUrl) {
            return { send: true, environmentInfo };
        }

        const authNotSelected = options?.auth && !environmentInfo?.send_auth_webhook;
        const notAlwaysSend = !options?.auth && !environmentInfo?.always_send_webhook;

        if (!hasWebhookUrl || authNotSelected || notAlwaysSend) {
            return { send: false, environmentInfo };
        }

        return { send: true, environmentInfo };
    }

    async sendSyncUpdate(
        nangoConnection: NangoConnection,
        syncName: string,
        model: string,
        responseResults: SyncResult,
        syncType: SyncType,
        now: Date | undefined,
        activityLogId: number,
        environment_id: number
    ) {
        const { environmentInfo } = await this.shouldSendWebhook(nangoConnection.environment_id);

        if (!environmentInfo || !environmentInfo.webhook_url) {
            return;
        }

        const { webhook_url: webhookUrl, always_send_webhook: alwaysSendWebhook } = environmentInfo;

        const noChanges =
            responseResults.added === 0 && responseResults.updated === 0 && (responseResults.deleted === 0 || responseResults.deleted === undefined);

        if (!alwaysSendWebhook && noChanges) {
            await createActivityLogMessage({
                level: 'info',
                environment_id,
                activity_log_id: activityLogId,
                content: `There were no added, updated, or deleted results. No webhook sent, as per your environment settings.`,
                timestamp: Date.now()
            });

            return;
        }

        const body: NangoSyncWebhookBody = {
            from: 'nango',
            type: WebhookType.SYNC,
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

        const endingMessage = noChanges
            ? 'with no data changes as per your environment settings.'
            : `with the following data: ${JSON.stringify(body, null, 2)}`;

        try {
            const headers = this.getSignatureHeader(environmentInfo.secret_key, body);

            const response = await backOff(
                () => {
                    return axios.post(webhookUrl as string, body, { headers });
                },
                { numOfAttempts: RETRY_ATTEMPTS, retry: this.retry.bind(this, activityLogId, environment_id) }
            );

            if (response.status >= 200 && response.status < 300) {
                await createActivityLogMessage({
                    level: 'info',
                    environment_id,
                    activity_log_id: activityLogId,
                    content: `Sync webhook sent successfully and received with a ${response.status} response code to ${webhookUrl} ${endingMessage}`,
                    timestamp: Date.now()
                });
            } else {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId,
                    content: `Sync webhook sent successfully to ${webhookUrl} ${endingMessage} but received a ${response.status} response code. Please send a 2xx on successful receipt.`,
                    timestamp: Date.now()
                });
            }
        } catch (e) {
            const errorMessage = JSON.stringify(e, ['message', 'name', 'stack'], 2);

            await createActivityLogMessage({
                level: 'error',
                environment_id,
                activity_log_id: activityLogId,
                content: `Sync webhook failed to send to ${webhookUrl}. The error was: ${errorMessage}`,
                timestamp: Date.now()
            });
        }
    }

    async sendAuthUpdate(connection: RecentlyCreatedConnection, provider: string, success: boolean, activityLogId: number | null): Promise<void> {
        const { send, environmentInfo } = await this.shouldSendWebhook(connection.environment_id, { auth: true });

        if (!send || !environmentInfo) {
            return;
        }

        const { webhook_url: webhookUrl } = environmentInfo;

        const environment_id = connection.environment_id;
        const environment = await environmentService.getEnvironmentName(environment_id);

        const body: NangoAuthWebhookBody = {
            from: 'nango',
            type: WebhookType.AUTH,
            connectionId: connection.connection_id,
            providerConfigKey: connection.provider_config_key,
            authMode: connection.auth_mode,
            provider,
            environment: environment as string,
            success,
            operation: connection.operation
        };

        if (connection.error) {
            body.error = connection.error;
        }

        try {
            const headers = this.getSignatureHeader(environmentInfo.secret_key, body);

            const response = await backOff(
                () => {
                    return axios.post(webhookUrl as string, body, { headers });
                },
                { numOfAttempts: RETRY_ATTEMPTS, retry: this.retry.bind(this, activityLogId, environment_id) }
            );

            if (activityLogId) {
                if (response.status >= 200 && response.status < 300) {
                    await createActivityLogMessage({
                        level: 'info',
                        environment_id,
                        activity_log_id: activityLogId,
                        content: `Auth webhook sent successfully and received with a ${response.status} response code to ${webhookUrl}`,
                        timestamp: Date.now()
                    });
                } else {
                    await createActivityLogMessage({
                        level: 'error',
                        environment_id,
                        activity_log_id: activityLogId,
                        content: `Auth Webhook sent successfully to ${webhookUrl} but received a ${response.status} response code. Please send a 2xx on successful receipt.`,
                        timestamp: Date.now()
                    });
                }
            }
        } catch (e) {
            if (activityLogId) {
                const errorMessage = JSON.stringify(e, ['message', 'name', 'stack'], 2);

                await createActivityLogMessage({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId,
                    content: `Auth Webhook failed to send to ${webhookUrl}. The error was: ${errorMessage}`,
                    timestamp: Date.now()
                });
            }
        }
    }

    async forward(
        environment_id: number,
        providerConfigKey: string,
        provider: string,
        payload: Record<string, any> | null,
        webhookOriginalHeaders: Record<string, any>
    ) {
        const { send, environmentInfo } = await this.shouldSendWebhook(environment_id, { forward: true });

        if (!send || !environmentInfo) {
            return;
        }

        const { webhook_url: webhookUrl } = environmentInfo;

        const log = {
            level: 'info' as LogLevel,
            success: true,
            action: LogActionEnum.WEBHOOK,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: '',
            provider_config_key: providerConfigKey,
            provider: provider,
            environment_id: environment_id
        };

        const activityLogId = await createActivityLog(log);

        const body = {
            from: provider,
            type: WebhookType.FORWARD,
            payload: payload
        };

        const nangoHeaders = this.getSignatureHeader(environmentInfo.secret_key, body);

        const headers = {
            ...nangoHeaders,
            ...this.filterHeaders(webhookOriginalHeaders)
        };

        try {
            const response = await backOff(
                () => {
                    return axios.post(environmentInfo.webhook_url as string, body, { headers });
                },
                { numOfAttempts: RETRY_ATTEMPTS, retry: this.retry.bind(this, activityLogId as number, environment_id) }
            );

            if (response.status >= 200 && response.status < 300) {
                await createActivityLogMessageAndEnd({
                    level: 'info',
                    environment_id,
                    activity_log_id: activityLogId as number,
                    content: `Webhook forward was sent successfully and received with a ${
                        response.status
                    } response code to ${webhookUrl} with the following data: ${JSON.stringify(body, null, 2)}`,
                    timestamp: Date.now()
                });
            } else {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId as number,
                    content: `Webhook forward was sent successfully to ${webhookUrl} with the following data: ${JSON.stringify(body, null, 2)} but received a ${
                        response.status
                    } response code. Please send a 200 on successful receipt.`,
                    timestamp: Date.now()
                });
            }
        } catch (e) {
            const errorMessage = JSON.stringify(e, ['message', 'name', 'stack'], 2);

            await createActivityLogMessageAndEnd({
                level: 'error',
                environment_id,
                activity_log_id: activityLogId as number,
                content: `Webhook forward failed to send to ${webhookUrl}. The error was: ${errorMessage}`,
                timestamp: Date.now()
            });
        }
    }
}

export default new WebhookService();
