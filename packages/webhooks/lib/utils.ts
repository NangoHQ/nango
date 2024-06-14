import crypto from 'crypto';
import { backOff } from 'exponential-backoff';
import type { AxiosError } from 'axios';
import { axiosInstance as axios } from '@nangohq/utils';
import type { Environment } from '@nangohq/types';
import type { LogContext } from '@nangohq/logs';

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

export const shouldSend = (environment: Environment, type: 'auth' | 'sync' | 'forward'): boolean => {
    const hasAnyWebhook = environment.webhook_url || environment.webhook_url_secondary;

    if (type === 'forward' && hasAnyWebhook) {
        return true;
    }

    const authNotSelected = type === 'auth' && !environment.send_auth_webhook;

    if (!hasAnyWebhook || authNotSelected) {
        return false;
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
