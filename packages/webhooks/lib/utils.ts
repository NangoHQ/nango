import crypto from 'crypto';
import { backOff } from 'exponential-backoff';
import type { AxiosError } from 'axios';
import { axiosInstance as axios } from '@nangohq/utils';
import type { LogContext } from '@nangohq/logs';
import type { SyncType, AuthOperationType, Environment, ExternalWebhook } from '@nangohq/types';

export const RETRY_ATTEMPTS = 7;

export const NON_FORWARDABLE_HEADERS = [
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

export const retry = async (
    activityLogId: number | null,
    logCtx?: LogContext | null | undefined,
    error?: AxiosError,
    attemptNumber?: number
): Promise<boolean> => {
    if (error?.response && (error?.response?.status < 200 || error?.response?.status >= 300)) {
        const content = `Webhook response received an ${
            error?.response?.status || error?.code
        } error, retrying with exponential backoffs for ${attemptNumber} out of ${RETRY_ATTEMPTS} times`;

        if (activityLogId) {
            await logCtx?.error(content);
        }

        return true;
    }

    return false;
};

export const getSignatureHeader = (secret: string, payload: unknown): Record<string, string> => {
    const combinedSignature = `${secret}${JSON.stringify(payload)}`;
    const createdHash = crypto.createHash('sha256').update(combinedSignature).digest('hex');

    return {
        'X-Nango-Signature': createdHash
    };
};

export const filterHeaders = (headers: Record<string, string>): Record<string, string> => {
    const filteredHeaders: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
        if (NON_FORWARDABLE_HEADERS.some((header) => key.toLowerCase().startsWith(header))) {
            continue;
        }

        filteredHeaders[key] = value;
    }

    return filteredHeaders;
};

export const shouldSend = ({
    webhookSettings,
    success,
    type,
    operation
}: {
    webhookSettings: ExternalWebhook;
    success: boolean;
    type: 'auth' | 'sync' | 'forward';
    operation: SyncType | AuthOperationType;
}): boolean => {
    const hasAnyWebhook = Boolean(webhookSettings.primary_url || webhookSettings.secondary_url);

    if (type === 'forward') {
        return hasAnyWebhook;
    }

    if (!hasAnyWebhook) {
        return false;
    }

    if (type === 'auth') {
        if (operation === 'creation' && !webhookSettings.on_auth_creation) {
            return false;
        }

        if (operation === 'refresh' && !webhookSettings.on_auth_refresh_error) {
            return false;
        }

        return true;
    }

    if (type === 'sync') {
        if (!success && !webhookSettings.on_sync_error) {
            return false;
        }
    }

    return true;
};

export const deliver = async ({
    webhooks,
    body,
    webhookType,
    activityLogId,
    logCtx,
    environment,
    endingMessage = ''
}: {
    webhooks: { url: string; type: string }[];
    body: unknown;
    webhookType: string;
    activityLogId: number | null;
    environment: Environment;
    logCtx?: LogContext | undefined;
    endingMessage?: string;
}): Promise<void> => {
    for (const webhook of webhooks) {
        const { url, type } = webhook;

        try {
            const headers = getSignatureHeader(environment.secret_key, body);

            const response = await backOff(
                () => {
                    return axios.post(url, body, { headers });
                },
                { numOfAttempts: RETRY_ATTEMPTS, retry: retry.bind(this, activityLogId, logCtx) }
            );

            if (activityLogId) {
                if (response.status >= 200 && response.status < 300) {
                    await logCtx?.info(
                        `${webhookType} webhook sent successfully to the ${type} ${url} and received with a ${response.status} response code${endingMessage ? ` ${endingMessage}` : ''}.`,
                        body as Record<string, unknown>
                    );
                } else {
                    await logCtx?.error(
                        `${webhookType} sent webhook successfully to the ${type} ${url} but received a ${response.status} response code${endingMessage ? ` ${endingMessage}` : ''}. Please send a 2xx on successful receipt.`,
                        body as Record<string, unknown>
                    );
                }
            }
        } catch (err) {
            if (activityLogId) {
                await logCtx?.error(`${webhookType} webhook failed to send to the ${type} to ${url}`, {
                    error: err
                });
            }
        }
    }
};
