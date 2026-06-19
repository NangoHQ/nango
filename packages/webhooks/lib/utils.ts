import crypto from 'crypto';

import { isAxiosError } from 'axios';

import {
    absoluteUrlFromRedirectRequestOptions,
    createRedirectValidator,
    getSafeHttpAgents,
    isOutboundUrlAllowed,
    resolvePolicyForServer
} from '@nangohq/egress';
import { getRedis } from '@nangohq/kvstore';
import { createMeteringTransport } from '@nangohq/shared';
import { axiosInstance as axios, Err, getLogger, networkError, Ok, redactHeaders, retryFlexible, stringifyStable, userAgent } from '@nangohq/utils';

import { CircuitBreakerPassThrough, CircuitBreakerRedis } from './circuitBreaker.js';
import { envs } from './envs.js';

import type { OutboundUrlPolicy } from '@nangohq/egress';
import type { LogContext } from '@nangohq/logs';
import type { MeteredBytes } from '@nangohq/shared';
import type { ConnectionConfig, DBAPISecret, DBExternalWebhook, MessageHTTPResponse, MessageRow, WebhookTypes } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { AxiosError, AxiosResponse } from 'axios';

const logger = getLogger('webhooks.utils');

export const RETRY_ATTEMPTS = envs.NANGO_WEBHOOK_RETRY_ATTEMPTS;

export type WebhookAgents = ReturnType<typeof getSafeHttpAgents>;

export interface WebhookOutbound {
    policy: OutboundUrlPolicy;
    agents: WebhookAgents;
    validateRedirect: (options: Record<string, unknown>) => void;
}

/** Build a {@link WebhookOutbound} from a policy and its agents, wiring the redirect validator to the policy. */
export function createWebhookOutbound({ policy, agents }: { policy: OutboundUrlPolicy; agents: WebhookAgents }): WebhookOutbound {
    const redirectValidator = createRedirectValidator(policy);
    return {
        policy,
        agents,
        // Validate each redirect target (scheme + hostname denylist) before follow-redirects follows it.
        validateRedirect: (options) => {
            const absolute = absoluteUrlFromRedirectRequestOptions(options);
            if (absolute) {
                redirectValidator(absolute);
            }
        }
    };
}

let defaultWebhookOutbound: WebhookOutbound | undefined;

function getDefaultWebhookOutbound(): WebhookOutbound {
    if (!defaultWebhookOutbound) {
        const policy = resolvePolicyForServer({
            proxyBaseUrlOverrideDenylist: envs.NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST,
            outboundUrlPolicy: envs.NANGO_OUTBOUND_URL_POLICY
        });
        defaultWebhookOutbound = createWebhookOutbound({ policy, agents: getSafeHttpAgents(policy) });
    }
    return defaultWebhookOutbound;
}

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

/**
 * Overrides the environment webhook URLs with the connection's webhook URLs overrides if set.
 * If only the primary URL is set on the connection, the environment secondary URL is NOT used as
 * fallback to prevent leaking the connection's webhooks to the shared endpoint.
 */
export function resolveWebhookSettings(
    webhookSettings: DBExternalWebhook,
    connectionConfig: Pick<ConnectionConfig, 'webhook_url' | 'webhook_url_secondary'> | null | undefined
): DBExternalWebhook {
    const primary = connectionConfig?.webhook_url;
    if (typeof primary !== 'string' || primary.trim() === '') {
        return webhookSettings;
    }

    const secondary = connectionConfig?.webhook_url_secondary;
    return {
        ...webhookSettings,
        primary_url: primary,
        secondary_url: typeof secondary === 'string' && secondary.trim() !== '' ? secondary : null
    };
}

export const deliver = async ({
    webhooks,
    body,
    webhookType,
    logCtx,
    secret,
    endingMessage = '',
    incomingHeaders,
    onBytes,
    outbound = getDefaultWebhookOutbound()
}: {
    webhooks: { url: string; type: string }[];
    body: unknown;
    webhookType: WebhookTypes;
    secret: DBAPISecret['secret'];
    logCtx?: LogContext | undefined;
    endingMessage?: string;
    incomingHeaders?: Record<string, string>;
    onBytes?: (bytes: MeteredBytes) => void;
    outbound?: WebhookOutbound;
}): Promise<Result<void>> => {
    let success = true;

    for (const webhook of webhooks) {
        const { url, type } = webhook;

        if (!isOutboundUrlAllowed(url, outbound.policy)) {
            void logCtx?.warn(`Skipping webhook delivery to denied URL (${type})`);
            continue;
        }

        const filteredHeaders = filterHeaders(incomingHeaders || {});

        // We manually stringify the body to ensure that the order of the keys is consistent
        // and that axios won't modify the payload in any way.
        const bodyString = stringifyStable(body);
        if (bodyString.isErr()) {
            return Err(new Error('Failed to stringify webhook body', { cause: bodyString.error }));
        }

        const headers = {
            ...filteredHeaders,
            'X-Nango-Signature': getSignatureHeaderUnsafe(secret, bodyString.value),
            'X-Nango-Hmac-Sha256': getHmacSignatureHeader(secret, bodyString.value),
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
                        const attemptBytes: MeteredBytes = { sent: 0, received: 0 };
                        const transport = createMeteringTransport({
                            onBytes: (hop) => {
                                attemptBytes.sent += hop.sent;
                                attemptBytes.received += hop.received;
                            },
                            beforeRedirect: outbound.validateRedirect,
                            maxRedirects: outbound.policy.maxRedirects
                        });
                        try {
                            const res = await axios.post(url, bodyString.value, {
                                headers,
                                timeout: envs.NANGO_WEBHOOK_TIMEOUT_MS,
                                transport,
                                httpAgent: outbound.agents.httpAgent,
                                httpsAgent: outbound.agents.httpsAgent,
                                maxRedirects: outbound.policy.maxRedirects
                            });

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
                        } finally {
                            try {
                                onBytes?.(attemptBytes);
                            } catch (err) {
                                logger.error('onBytes callback failed', err);
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
