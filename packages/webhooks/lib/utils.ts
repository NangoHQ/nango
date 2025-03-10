import crypto from 'crypto';
import type { AxiosResponse, AxiosError } from 'axios';
import { isAxiosError } from 'axios';
import type { Result } from '@nangohq/utils';
import { Err, Ok, axiosInstance as axios, retryWithBackoff, redactHeaders } from '@nangohq/utils';
import type { LogContext } from '@nangohq/logs';
import type { WebhookTypes, SyncOperationType, AuthOperationType, DBExternalWebhook, DBEnvironment, MessageRow, MessageHTTPResponse } from '@nangohq/types';

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

function formatLogResponse(response: AxiosResponse): MessageHTTPResponse {
    return {
        code: response.status,
        headers: redactHeaders({ headers: response.headers })
    };
}

export const retry = (logCtx?: LogContext | null, error?: AxiosError, attemptNumber: number = 0): boolean => {
    if (error?.response && (error?.response?.status < 200 || error?.response?.status >= 300)) {
        void logCtx?.warn(`HTTP Status error, retrying with exponential backoffs for ${attemptNumber} out of ${RETRY_ATTEMPTS} times`);
        return true;
    } else if (error && !error.response) {
        void logCtx?.warn(
            `Error "${error.code ? error.code : 'unknown'}", retrying with exponential backoffs for ${attemptNumber} out of ${RETRY_ATTEMPTS} times`
        );
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
    webhookSettings: DBExternalWebhook;
    success: boolean;
    type: 'auth' | 'sync' | 'forward';
    operation: SyncOperationType | AuthOperationType | 'incoming_webhook';
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

        const filteredHeaders = filterHeaders(incomingHeaders || {});
        const headers = {
            ...getSignatureHeader(environment.secret_key, body),
            ...filteredHeaders
        };

        const logRequest: MessageRow['request'] = {
            method: 'POST',
            url,
            headers: redactHeaders({ headers: filteredHeaders }),
            body
        };

        try {
            const response = await retryWithBackoff(
                async () => {
                    try {
                        return await axios.post(url, body, { headers });
                    } catch (err) {
                        if (isAxiosError(err)) {
                            void logCtx?.http(`POST ${logRequest.url}`, {
                                response: err.response ? formatLogResponse(err.response) : undefined,
                                request: logRequest,
                                error: !err.response ? err : null,
                                level: 'error'
                            });
                        } else {
                            void logCtx?.http(`POST ${logRequest?.url}`, {
                                request: logRequest,
                                response: undefined,
                                error: err,
                                level: 'error'
                            });
                        }
                        throw err;
                    }
                },
                { numOfAttempts: RETRY_ATTEMPTS, retry: retry.bind(this, logCtx) }
            );

            if (logCtx) {
                await logCtx.http(`POST ${url}`, { request: logRequest, response: formatLogResponse(response) });

                if (response.status >= 200 && response.status < 300) {
                    void logCtx.info(`Webhook "${webhookType}" sent successfully (${type} URL) ${endingMessage ? ` ${endingMessage}` : ''}`);
                } else {
                    await logCtx.warn(
                        `Webhook "${webhookType}" sent successfully (${type} URL) but received a "${response.status}" response code${endingMessage ? ` ${endingMessage}` : ''}. Please send a 2xx on successful receipt.`
                    );
                    success = false;
                }
            }
        } catch {
            // error should already be logged in retry()
            success = false;
        }
    }

    return success ? Ok(undefined) : Err(new Error('Failed to send webhooks'));
};
