import crypto from 'crypto';

import { isAxiosError } from 'axios';

import { getRedis } from '@nangohq/kvstore';
import { Err, Ok, axiosInstance as axios, networkError, redactHeaders, retryFlexible, stringifyStable, userAgent } from '@nangohq/utils';

import { CircuitBreakerPassThrough, CircuitBreakerRedis } from './circuitBreaker.js';
import { envs } from './envs.js';

import type { LogContext } from '@nangohq/logs';
import type { DBEnvironment, DBExternalWebhook, MessageHTTPResponse, MessageRow, WebhookTypes } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { AxiosError, AxiosResponse } from 'axios';

export const RETRY_ATTEMPTS = envs.NANGO_WEBHOOK_RETRY_ATTEMPTS;

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

const circuitBreaker = await (async () => {
    if (envs.NANGO_REDIS_URL) {
        const redis = await getRedis(envs.NANGO_REDIS_URL);
        return new CircuitBreakerRedis({
            id: 'webhooks',
            redis,
            options: {
                failureThreshold: envs.NANGO_WEBHOOK_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
                windowSecs: envs.NANGO_WEBHOOK_CIRCUIT_BREAKER_WINDOW_SECS,
                cooldownDurationSecs: envs.NANGO_WEBHOOK_CIRCUIT_BREAKER_COOLDOWN_DURATION_SECS,
                autoResetSecs: envs.NANGO_WEBHOOK_CIRCUIT_BREAKER_AUTO_RESET_SECS
            }
        });
    }
    return new CircuitBreakerPassThrough();
})();

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

/**
 * This version of generating a signature is vulnerable to length-extension attacks
 */
export const getSignatureHeaderUnsafe = (secret: string, payload: string): string => {
    const combinedSignature = `${secret}${payload}`;
    const createdHash = crypto.createHash('sha256').update(combinedSignature).digest('hex');

    return createdHash;
};

/**
 * This version of generating a signature uses an HMAC to make it safe from length-extension attacks.
 */
export const getHmacSignatureHeader = (secret: string, payload: string): string => {
    const createdHash = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    return createdHash;
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
    type
}: {
    webhookSettings: DBExternalWebhook;
    success: boolean;
    type: 'auth_creation' | 'auth_refresh' | 'auth_override' | 'sync' | 'forward' | 'async_action';
}): boolean => {
    const hasAnyWebhook = Boolean(webhookSettings.primary_url || webhookSettings.secondary_url);

    if (type === 'forward') {
        return hasAnyWebhook;
    }

    if (!hasAnyWebhook) {
        return false;
    }

    if (type === 'auth_creation' && !webhookSettings.on_auth_creation) {
        return false;
    }

    if (type === 'auth_refresh' && !webhookSettings.on_auth_refresh_error) {
        return false;
    }

    if (type === 'sync' && !success && !webhookSettings.on_sync_error) {
        return false;
    }

    if (type === 'async_action' && !webhookSettings.on_async_action_completion) {
        return false;
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
    environment: Pick<DBEnvironment, 'secret_key'>;
    logCtx?: LogContext | undefined;
    endingMessage?: string;
    incomingHeaders?: Record<string, string>;
}): Promise<Result<void>> => {
    let success = true;

    for (const webhook of webhooks) {
        const { url, type } = webhook;

        const filteredHeaders = filterHeaders(incomingHeaders || {});

        // We manually stringify the body to ensure that the order of the keys is consistent
        // and that axios won't modify the payload in any way.
        const bodyString = stringifyStable(body);
        if (bodyString.isErr()) {
            return Err(new Error('Failed to stringify webhook body', { cause: bodyString.error }));
        }

        const headers = {
            ...filteredHeaders,
            'X-Nango-Signature': getSignatureHeaderUnsafe(environment.secret_key, bodyString.value),
            'X-Nango-Hmac-Sha256': getHmacSignatureHeader(environment.secret_key, bodyString.value),
            'content-type': 'application/json',
            'user-agent': userAgent
        };

        const logRequest: MessageRow['request'] = {
            method: 'POST',
            url,
            headers: redactHeaders({ headers: filteredHeaders }),
            body
        };

        try {
            await retryFlexible(
                async () => {
                    const result = await circuitBreaker.execute(url, async () => {
                        const createdAt = new Date();
                        try {
                            const res = await axios.post(url, bodyString.value, { headers, timeout: envs.NANGO_WEBHOOK_TIMEOUT_MS });

                            void logCtx?.http(`POST ${url}`, { request: logRequest, response: formatLogResponse(res), context: 'webhook', createdAt });
                            if (res.status >= 200 && res.status < 300) {
                                void logCtx?.info(`Webhook "${webhookType}" sent successfully (${type} URL) ${endingMessage ? ` ${endingMessage}` : ''}`);
                                return Ok(res);
                            } else {
                                void logCtx?.warn(
                                    `Webhook "${webhookType}" sent successfully (${type} URL) but received a "${res.status}" response code${endingMessage ? ` ${endingMessage}` : ''}. Please send a 2xx on successful receipt.`
                                );
                                return Err(`non_2xx_status_${res.status}`);
                            }
                        } catch (err) {
                            if (isAxiosError(err)) {
                                void logCtx?.http(`POST ${logRequest.url}`, {
                                    response: err.response ? formatLogResponse(err.response) : undefined,
                                    request: logRequest,
                                    context: 'webhook',
                                    error: !err.response ? err : null,
                                    level: 'error',
                                    createdAt
                                });
                                return Err(err);
                            } else {
                                void logCtx?.http(`POST ${logRequest?.url}`, {
                                    request: logRequest,
                                    response: undefined,
                                    context: 'webhook',
                                    error: err,
                                    level: 'error',
                                    createdAt
                                });
                                return Err(new Error('unknown_error', { cause: err }));
                            }
                        }
                    });

                    if (result.isErr()) {
                        throw result.error;
                    }
                    return result.value;
                },
                {
                    max: RETRY_ATTEMPTS,
                    onError: ({ err, nextWait, max, attempt }) => {
                        const retry = shouldRetry(err);
                        if (retry.retry) {
                            void logCtx?.warn(`Retrying HTTP call (reason: ${retry.reason}). Waiting for ${nextWait}ms [${attempt}/${max}]`);
                        } else {
                            void logCtx?.warn(`Skipping retry HTTP call (reason: ${retry.reason}) [${attempt}/${max}]`);
                        }

                        return retry;
                    }
                }
            );
        } catch {
            // error should already be logged in retry()
            success = false;
        }
    }

    return success ? Ok(undefined) : Err(new Error('Failed to send webhooks'));
};

export function shouldRetry(err: unknown): { retry: boolean; reason: string } {
    if (!isAxiosError(err)) {
        let reason = 'unknown_error';
        if (err instanceof Error && err.message.startsWith('circuit_breaker')) {
            reason = 'circuit_breaker_open';
        }
        return { retry: false, reason };
    }

    if (err.code && networkError.includes(err.code)) {
        return { retry: true, reason: 'network_error' };
    }

    if (!err.response) {
        return { retry: false, reason: 'invalid_response' };
    }
    const status = err.response?.status || 0;

    if (status >= 300 && status < 500) {
        return { retry: false, reason: `status_code_${status}` };
    }

    return { retry: true, reason: `status_code_${status}` };
}
