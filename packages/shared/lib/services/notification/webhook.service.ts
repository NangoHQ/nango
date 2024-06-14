import type { AxiosError } from 'axios';
import { axiosInstance as axios, stringifyError } from '@nangohq/utils';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { backOff } from 'exponential-backoff';
import crypto from 'crypto';
import type { Account, Config, Environment } from '../../models/index.js';
import type { LogLevel } from '../../models/Activity.js';
import { LogActionEnum } from '../../models/Activity.js';
import type { NangoForwardWebhookBody } from '../../models/Webhook.js';
import { WebhookType } from '../../models/Webhook.js';
import { createActivityLog, createActivityLogMessage, createActivityLogMessageAndEnd } from '../activity/activity.service.js';
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
    private retry = async (
        activityLogId: number | null,
        environment_id: number,
        logCtx?: LogContext | null | undefined,
        error?: AxiosError,
        attemptNumber?: number
    ): Promise<boolean> => {
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
                await logCtx?.error(content);
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

        const log = {
            level: 'info' as LogLevel,
            success: true,
            action: LogActionEnum.WEBHOOK,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: connectionId,
            provider_config_key: integration.unique_key,
            provider: integration.provider,
            environment_id: integration.environment_id
        };

        const activityLogId = await createActivityLog(log);
        const logCtx = await logContextGetter.create(
            {
                id: String(activityLogId),
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
                    { numOfAttempts: RETRY_ATTEMPTS, retry: this.retry.bind(this, activityLogId as number, environment.id, logCtx) }
                );

                if (response.status >= 200 && response.status < 300) {
                    await createActivityLogMessageAndEnd({
                        level: 'info',
                        environment_id: integration.environment_id,
                        activity_log_id: activityLogId as number,
                        content: `Webhook forward was sent successfully ${type === 'webhookUrlSecondary' ? 'to the secondary webhook URL' : ''} and received with a ${
                            response.status
                        } response code to ${url} with the following data: ${JSON.stringify(body, null, 2)}`,
                        timestamp: Date.now()
                    });
                    await logCtx.info(`Webhook forward ${type === 'webhookUrlSecondary' ? 'to the secondary webhook URL' : ''} was sent successfully`, {
                        status: response.status,
                        body,
                        webhookUrl
                    });
                    await logCtx.success();
                } else {
                    await createActivityLogMessageAndEnd({
                        level: 'error',
                        environment_id: integration.environment_id,
                        activity_log_id: activityLogId as number,
                        content: `Webhook forward ${type === 'webhookUrlSecondary' ? 'to the secondary webhook URL' : ''} was sent successfully to ${url} with the following data: ${JSON.stringify(body, null, 2)} but received a ${
                            response.status
                        } response code. Please send a 200 on successful receipt.`,
                        timestamp: Date.now()
                    });
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
            } catch (e) {
                const errorMessage = stringifyError(e, { pretty: true });

                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: integration.environment_id,
                    activity_log_id: activityLogId as number,
                    content: `Webhook forward ${type === 'webhookUrlSecondary' ? 'to the secondary webhook URL' : ''} failed to send to ${url}. The error was: ${errorMessage}`,
                    timestamp: Date.now()
                });
                await logCtx.error(`Webhook forward ${type === 'webhookUrlSecondary' ? 'to the secondary webhook URL' : ''} failed`, { error: e, webhookUrl });
                await logCtx.failed();
            }
        }
    }
}

export default new WebhookService();
