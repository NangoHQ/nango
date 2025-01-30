import crypto from 'crypto';
import type { AxiosResponse } from 'axios';
import { AxiosError } from 'axios';
import type { Result } from '@nangohq/utils';
import { Err, Ok, axiosInstance as axios, retryWithBackoff, redactHeaders } from '@nangohq/utils';
import type { LogContext } from '@nangohq/logs';
import type { WebhookTypes, SyncType, AuthOperationType, ExternalWebhook, DBEnvironment, MessageRow } from '@nangohq/types';

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

function formatLogResponse(response: AxiosResponse): MessageRow['response'] {
    return {
        code: response.status,
        headers: response.headers ? redactHeaders({ headers: response.headers }) : {},
        body: response.data
    };
}

export const retry = async (logRequest: MessageRow['request'], logCtx?: LogContext | null, error?: AxiosError, attemptNumber?: number): Promise<boolean> => {
    if (error?.response && (error?.response?.status < 200 || error?.response?.status >= 300)) {
        const content = `Webhook response received a ${
            error?.response?.status || error?.code
        } error, retrying with exponential backoffs for ${attemptNumber} out of ${RETRY_ATTEMPTS} times`;

        await logCtx?.http(content, { response: formatLogResponse(error.response), request: logRequest });
        return true;
    } else if (error && !error.response) {
        const content = `Webhook request failed with an ${error.code ? error.code : 'unknown'} error, retrying with exponential backoffs for ${attemptNumber} out of ${RETRY_ATTEMPTS} times`;

        await logCtx?.error(content, { request: logRequest });
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
                () => {
                    return axios.post(url, body, { headers });
                },
                { numOfAttempts: RETRY_ATTEMPTS, retry: retry.bind(this, logRequest, logCtx) }
            );

            if (logCtx) {
                const logResponse = formatLogResponse(response);

                if (response.status >= 200 && response.status < 300) {
                    await logCtx.http(
                        `${webhookType} webhook sent successfully to the ${type} ${url} and received with a ${response.status} response code${endingMessage ? ` ${endingMessage}` : ''}.`,
                        { request: logRequest, response: logResponse }
                    );
                } else {
                    await logCtx.http(
                        `${webhookType} sent webhook successfully to the ${type} ${url} but received a ${response.status} response code${endingMessage ? ` ${endingMessage}` : ''}. Please send a 2xx on successful receipt.`,
                        { request: logRequest, response: logResponse }
                    );
                    success = false;
                }
            }
        } catch (err) {
            if (logCtx) {
                if (err instanceof AxiosError && err.response) {
                    await logCtx.http(`${webhookType} webhook failed to send to the ${type} to ${url}`, {
                        request: logRequest,
                        response: formatLogResponse(err.response),
                        meta: {
                            error: {
                                message: err.message,
                                code: err.code
                            }
                        }
                    });
                } else {
                    await logCtx.error(`${webhookType} webhook failed to send to the ${type} to ${url}`, {
                        error: err
                    });
                }
            }

            success = false;
        }
    }

    return success ? Ok(undefined) : Err(new Error('Failed to send webhooks'));
};
