import crypto from 'crypto';
import type { AxiosError } from 'axios';
import type { Result } from '@nangohq/utils';
import { Err, Ok, axiosInstance as axios, retryWithBackoff, truncateJson } from '@nangohq/utils';
import type { LogContext } from '@nangohq/logs';
import type { WebhookTypes, SyncType, AuthOperationType, ExternalWebhook, DBEnvironment } from '@nangohq/types';
import { redactHeaders } from '@nangohq/shared';
import type { ClientRequest } from 'node:http';

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

export const retry = async (logCtx?: LogContext | null, error?: AxiosError, attemptNumber?: number): Promise<boolean> => {
    if (error && !error.response) {
        const content = `Webhook request failed with an error, retrying with exponential backoffs for ${attemptNumber} out of ${RETRY_ATTEMPTS} times`;

        const meta: Record<string, unknown> = {};

        if (error.code) {
            meta['code'] = error.code;
        }

        await logCtx?.error(content, meta);
        return true;
    } else if (error?.response && (error?.response?.status < 200 || error?.response?.status >= 300)) {
        const content = `Webhook response received a ${
            error?.response?.status || error?.code
        } error, retrying with exponential backoffs for ${attemptNumber} out of ${RETRY_ATTEMPTS} times`;

        const meta: Record<string, unknown> = {};

        if (error.code) {
            meta['code'] = error.code;
        }

        if (error.response) {
            const metaResponse: Record<string, unknown> = {};
            metaResponse['status'] = error.response.status;
            if (error.response.headers) {
                metaResponse['headers'] = redactHeaders({ headers: error.response.headers });
            }
            if (error.response.data) {
                metaResponse['data'] = error.response.data;
            }
            meta['response'] = metaResponse;

            if (error.request) {
                const request = error.request as ClientRequest;

                const metaRequest: Record<string, unknown> = {};
                metaRequest['url'] = `${request.protocol}//${request.host}${request.path}`;
                metaRequest['method'] = request.method;
                metaRequest['headers'] = redactHeaders({ headers: request.getHeaders() });
                meta['request'] = metaRequest;
            }
        }

        await logCtx?.error(content, truncateJson(meta));
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
    operation: SyncType | AuthOperationType | 'incoming_webhook';
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
    logCtx,
    environment,
    endingMessage = '',
    incomingHeaders
}: {
    webhooks: { url: string; type: string }[];
    body: unknown;
    webhookType: WebhookTypes;
    environment: DBEnvironment;
    logCtx?: LogContext | undefined;
    endingMessage?: string;
    incomingHeaders?: Record<string, string>;
}): Promise<Result<void>> => {
    let success = true;

    for (const webhook of webhooks) {
        const { url, type } = webhook;

        try {
            const filteredHeaders = filterHeaders(incomingHeaders || {});
            const headers = {
                ...getSignatureHeader(environment.secret_key, body),
                ...filteredHeaders
            };

            const response = await retryWithBackoff(
                () => {
                    return axios.post(url, body, { headers });
                },
                { numOfAttempts: RETRY_ATTEMPTS, retry: retry.bind(this, logCtx) }
            );

            if (logCtx) {
                if (response.status >= 200 && response.status < 300) {
                    await logCtx.info(
                        `${webhookType} webhook sent successfully to the ${type} ${url} and received with a ${response.status} response code${endingMessage ? ` ${endingMessage}` : ''}.`,
                        { headers: filteredHeaders, body }
                    );
                } else {
                    await logCtx.error(
                        `${webhookType} sent webhook successfully to the ${type} ${url} but received a ${response.status} response code${endingMessage ? ` ${endingMessage}` : ''}. Please send a 2xx on successful receipt.`,
                        { headers: filteredHeaders, body }
                    );
                    success = false;
                }
            }
        } catch (err) {
            await logCtx?.error(`${webhookType} webhook failed to send to the ${type} to ${url}`, { error: err });

            success = false;
        }
    }

    return success ? Ok(undefined) : Err(new Error('Failed to send webhooks'));
};
