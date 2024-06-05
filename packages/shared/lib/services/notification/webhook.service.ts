import type { AxiosError } from 'axios';
import { axiosInstance as axios } from '../../utils/axios.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { backOff } from 'exponential-backoff';
import crypto from 'crypto';
import { SyncType } from '../../models/Sync.js';
import type { NangoConnection, RecentlyCreatedConnection, RecentlyFailedConnection } from '../../models/Connection.js';
import type { Account, Config, Environment, SyncResult } from '../../models/index.js';
import type { NangoSyncWebhookBody, NangoAuthWebhookBody, NangoForwardWebhookBody } from '../../models/Webhook.js';
import { WebhookType } from '../../models/Webhook.js';
import type { LogContext, LogContextGetter } from '@nangohq/logs';

dayjs.extend(utc);

const RETRY_ATTEMPTS = 7;

const NON_FORWARDABLE_HEADERS = [
    'host',
    'authorization',
    'connection',
    'keep-alive',
    'content-length',
    'content-type', // we're sending json so don't want this overwritten
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
    private retry = async (logCtx?: LogContext | null | undefined, error?: AxiosError, attemptNumber?: number): Promise<boolean> => {
        if (error?.response && (error?.response?.status < 200 || error?.response?.status >= 300)) {
            const content = `Webhook response received an ${
                error?.response?.status || error?.code
            } error, retrying with exponential backoff for ${attemptNumber} out of ${RETRY_ATTEMPTS} times`;

            await logCtx?.error(content, { error });

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

    shouldSendWebhook(environment: Environment, options?: { auth?: boolean; forward?: boolean }): boolean {
        const hasAnyWebhook = environment.webhook_url || environment.webhook_url_secondary;

        if (options?.forward && hasAnyWebhook) {
            return true;
        }

        const authNotSelected = options?.auth && !environment.send_auth_webhook;

        if (!hasAnyWebhook || authNotSelected) {
            return false;
        }

        return true;
    }

    async sendSyncUpdate(
        nangoConnection: NangoConnection,
        syncName: string,
        model: string,
        responseResults: SyncResult,
        syncType: SyncType,
        now: Date | undefined,
        logCtx: LogContext,
        environment: Environment
    ) {
        if (!this.shouldSendWebhook(environment)) {
            return;
        }

        const { webhook_url: webhookUrl, webhook_url_secondary: webhookUrlSecondary, always_send_webhook: alwaysSendWebhook } = environment;

        const noChanges =
            responseResults.added === 0 && responseResults.updated === 0 && (responseResults.deleted === 0 || responseResults.deleted === undefined);

        if (!alwaysSendWebhook && noChanges) {
            await logCtx.info('There were no added, updated, or deleted results. No webhook sent, as per your environment settings');

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
            modifiedAfter: dayjs(now).toDate().toISOString(),
            queryTimeStamp: now as unknown as string
        };

        if (syncType === SyncType.INITIAL) {
            body.queryTimeStamp = null;
        }

        if (responseResults.deleted && responseResults.deleted > 0) {
            body.responseResults.deleted = responseResults.deleted;
        }

        const webhookUrls: { url: string; type: string }[] = [
            { url: webhookUrl, type: 'webhookUrl' },
            { url: webhookUrlSecondary, type: 'webhookUrlSecondary' }
        ].filter((webhook) => webhook.url) as { url: string; type: string }[];

        for (const webhookUrl of webhookUrls) {
            const { url, type } = webhookUrl;
            try {
                const headers = this.getSignatureHeader(environment.secret_key, body);

                const response = await backOff(
                    () => {
                        return axios.post(url, body, { headers });
                    },
                    { numOfAttempts: RETRY_ATTEMPTS, retry: this.retry.bind(this, logCtx) }
                );

                if (response.status >= 200 && response.status < 300) {
                    await logCtx.info(`Sync webhook sent successfully ${type === 'webhookUrlSecondary' ? 'to the secondary webhook URL' : ''}`, { url, body });
                    await logCtx.info(`Received "${response.status}" response code`);
                } else {
                    await logCtx.error(`Sync webhook failed to send ${type === 'webhookUrlSecondary' ? 'to the secondary webhook URL' : ''}`, { url, body });
                    await logCtx.error(`Received "${response.status}" response code. Please send a 2xx on successful receipt.`);
                }
            } catch (err) {
                await logCtx.error(`Sync webhook failed to send ${type === 'webhookUrlSecondary' ? 'to the secondary webhook URL' : ''}`, {
                    error: err,
                    url,
                    body
                });
            }
        }
    }

    async sendAuthUpdate(
        connection: RecentlyCreatedConnection | RecentlyFailedConnection,
        provider: string,
        success: boolean,
        logCtx?: LogContext | null
    ): Promise<void> {
        const { environment } = connection;

        if (!this.shouldSendWebhook(environment, { auth: true })) {
            return;
        }

        const { webhook_url: webhookUrl, webhook_url_secondary: webhookUrlSecondary, name: environmentName } = environment;

        const body: NangoAuthWebhookBody = {
            from: 'nango',
            type: WebhookType.AUTH,
            connectionId: connection.connection.connection_id,
            providerConfigKey: connection.connection.provider_config_key,
            authMode: connection.auth_mode,
            provider,
            environment: environmentName,
            success,
            operation: connection.operation
        };

        if (connection.error) {
            body.error = connection.error;
        }

        const webhookUrls: { url: string; type: string }[] = [
            { url: webhookUrl, type: 'webhookUrl' },
            { url: webhookUrlSecondary, type: 'webhookUrlSecondary' }
        ].filter((webhook) => webhook.url) as { url: string; type: string }[];

        for (const webhookUrl of webhookUrls) {
            const { url, type } = webhookUrl;

            try {
                const headers = this.getSignatureHeader(environment.secret_key, body);

                const response = await backOff(
                    () => {
                        return axios.post(url, body, { headers });
                    },
                    { numOfAttempts: RETRY_ATTEMPTS, retry: this.retry.bind(this, logCtx) }
                );

                if (logCtx) {
                    if (response.status >= 200 && response.status < 300) {
                        await logCtx.info(`Auth webhook sent successfully ${type === 'webhookUrlSecondary' ? 'to the secondary webhook URL' : ''}`, {
                            url,
                            body
                        });
                        await logCtx.info(`Received "${response.status}" response code`);
                    } else {
                        await logCtx.error(`Auth webhook failed to send ${type === 'webhookUrlSecondary' ? 'to the secondary webhook URL' : ''}`, {
                            url,
                            body
                        });
                        await logCtx.error(`Received "${response.status}" response code. Please send a 2xx on successful receipt.`);
                    }
                }
            } catch (err) {
                if (logCtx) {
                    await logCtx.error(`Auth webhook failed to send ${type === 'webhookUrlSecondary' ? 'to the secondary webhook URL' : ''}`, {
                        error: err,
                        url,
                        body
                    });
                }
            }
        }
    }

    async forward({
        integration,
        account,
        environment,
        connectionIds,
        payload,
        webhookOriginalHeaders,
        logContextGetter
    }: {
        integration: Config;
        account: Account;
        environment: Environment;
        connectionIds: string[];
        payload: Record<string, any> | null;
        webhookOriginalHeaders: Record<string, string>;
        logContextGetter: LogContextGetter;
    }) {
        if (!this.shouldSendWebhook(environment, { forward: true })) {
            return;
        }

        if (!connectionIds || connectionIds.length === 0) {
            await this.forwardHandler({ integration, account, environment, connectionId: '', payload, webhookOriginalHeaders, logContextGetter });
            return;
        }

        for (const connectionId of connectionIds) {
            await this.forwardHandler({ integration, account, environment, connectionId, payload, webhookOriginalHeaders, logContextGetter });
        }
    }

    async forwardHandler({
        integration,
        account,
        environment,
        connectionId,
        payload,
        webhookOriginalHeaders,
        logContextGetter
    }: {
        integration: Config;
        account: Account;
        environment: Environment;
        connectionId: string;
        payload: Record<string, any> | null;
        webhookOriginalHeaders: Record<string, string>;
        logContextGetter: LogContextGetter;
    }) {
        if (!this.shouldSendWebhook(environment, { forward: true })) {
            return;
        }

        const { webhook_url: webhookUrl, webhook_url_secondary: webhookUrlSecondary } = environment;

        const webhookUrls: { url: string; type: string }[] = [
            { url: webhookUrl, type: 'webhookUrl' },
            { url: webhookUrlSecondary, type: 'webhookUrlSecondary' }
        ].filter((webhook) => webhook.url) as { url: string; type: string }[];

        const logCtx = await logContextGetter.create(
            {
                operation: { type: 'webhook', action: 'outgoing' },
                message: 'Forwarding Webhook',
                expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
            },
            { account, environment, integration: { id: integration.id!, name: integration.unique_key, provider: integration.provider } }
        );

        const body: NangoForwardWebhookBody = {
            from: integration.provider,
            connectionId,
            providerConfigKey: integration.unique_key,
            type: WebhookType.FORWARD,
            payload: payload
        };

        const nangoHeaders = this.getSignatureHeader(environment.secret_key, body);

        const headers = {
            ...nangoHeaders,
            'X-Nango-Source-Content-Type': webhookOriginalHeaders['content-type'],
            ...this.filterHeaders(webhookOriginalHeaders)
        };

        for (const webhookUrl of webhookUrls) {
            const { url, type } = webhookUrl;

            try {
                const response = await backOff(
                    () => {
                        return axios.post(url, body, { headers });
                    },
                    { numOfAttempts: RETRY_ATTEMPTS, retry: this.retry.bind(this, logCtx) }
                );

                if (response.status >= 200 && response.status < 300) {
                    await logCtx.info(`Webhook forward ${type === 'webhookUrlSecondary' ? 'to the secondary webhook URL' : ''} was sent successfully`, {
                        status: response.status,
                        body,
                        webhookUrl
                    });
                    await logCtx.success();
                } else {
                    await logCtx.error(
                        `Webhook forward ${type === 'webhookUrlSecondary' ? 'to the secondary webhook URL' : ''} was sent successfully but received a wrong status code`,
                        {
                            status: response.status,
                            body,
                            webhookUrl
                        }
                    );
                    await logCtx.failed();
                }
            } catch (err) {
                await logCtx.error(`Webhook forward ${type === 'webhookUrlSecondary' ? 'to the secondary webhook URL' : ''} failed`, {
                    error: err,
                    webhookUrl
                });
                await logCtx.failed();
            }
        }
    }
}

export default new WebhookService();
