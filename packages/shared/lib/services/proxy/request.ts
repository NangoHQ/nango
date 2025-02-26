import { isAxiosError } from 'axios';
import type { AxiosResponse, AxiosRequestConfig } from 'axios';
import type { Result, RetryAttemptArgument } from '@nangohq/utils';
import { axiosInstance as axios, Err, Ok, redactHeaders, redactURL, retryFlexible } from '@nangohq/utils';

import type { ApplicationConstructedProxyConfiguration, MaybePromise, MessageRowInsert } from '@nangohq/types';
import { buildProxyHeaders, buildProxyURL, ProxyError } from './utils.js';
import { getProxyRetryFromErr } from './retry.js';

/**
 * This simple class is responsible to execute a call to a third-party
 * It's handling the logging and retry, nothing else.
 *
 * It's the same code for the SDK and for the Proxy API.
 */
export class ProxyRequest {
    logger: (msg: MessageRowInsert) => MaybePromise<void>;
    config: ApplicationConstructedProxyConfiguration;

    constructor({ logger, proxyConfig }: { logger: (msg: MessageRowInsert) => MaybePromise<void>; proxyConfig: ApplicationConstructedProxyConfiguration }) {
        this.logger = logger;
        this.config = proxyConfig;
    }

    /**
     * Prepare the request and execute.
     * Most code should use this method.
     */
    public async call(): Promise<Result<AxiosResponse>> {
        const options: AxiosRequestConfig = {};

        if (this.config.responseType) {
            options.responseType = this.config.responseType;
        }

        if (this.config.data) {
            options.data = this.config.data;
        }

        const { method } = this.config;

        options.url = buildProxyURL(this.config);
        options.method = method;

        options.headers = buildProxyHeaders(this.config, options.url);

        return await this.request({ axiosConfig: options });
    }

    /**
     * Send a request to the third-party with retry.
     * Only use this if you want a different axiosConfig than the one created in call()
     */
    public async request({ axiosConfig }: { axiosConfig: AxiosRequestConfig }): Promise<Result<AxiosResponse>> {
        try {
            const response = await retryFlexible<Promise<AxiosResponse>>(
                async (retryAttempt) => {
                    const start = new Date();
                    try {
                        const res = await axios.request(axiosConfig);
                        await this.logResponse({ response: res, axiosConfig, retryAttempt, start });
                        return res;
                    } catch (err) {
                        await this.logErrorResponse({ error: err, axiosConfig, retryAttempt, start });
                        throw err;
                    }
                },
                {
                    max: this.config.retries || 0,
                    onError: async ({ err, nextWait, max, attempt }) => {
                        const retry = getProxyRetryFromErr({ err, proxyConfig: this.config });
                        if (retry.retry) {
                            await this.logger({
                                type: 'log',
                                level: 'warn',
                                source: 'internal',
                                createdAt: new Date().toISOString(),
                                message: `Retrying HTTP call (reason: ${retry.reason}). Waiting for ${retry.wait ? retry.wait : nextWait}ms [${attempt}/${max}]`
                            });
                        } else {
                            await this.logger({
                                type: 'log',
                                level: 'warn',
                                source: 'internal',
                                createdAt: new Date().toISOString(),
                                message: `Skipping retry HTTP call (reason: ${retry.reason}) [${attempt}/${max}]`
                            });
                        }

                        return retry;
                    }
                }
            );
            return Ok(response);
        } catch (err) {
            return Err(err instanceof Error ? err : new ProxyError('unknown_error', '', err));
        }
    }

    private async logErrorResponse({
        error,
        axiosConfig,
        retryAttempt,
        start
    }: {
        error: unknown;
        axiosConfig: AxiosRequestConfig;
        retryAttempt: RetryAttemptArgument;
        start: Date;
    }): Promise<void> {
        const valuesToFilter = Object.values(this.config.connection.credentials);
        const redactedURL = redactURL({ url: axiosConfig.url!, valuesToFilter });

        if (isAxiosError(error)) {
            const safeHeaders = redactHeaders({ headers: axiosConfig.headers, valuesToFilter });
            await this.logger({
                type: 'http',
                level: 'error',
                source: 'internal',
                createdAt: start.toISOString(),
                endedAt: new Date().toISOString(),
                message: `${this.config.method} ${redactedURL}`,
                request: {
                    method: this.config.method,
                    url: redactedURL,
                    headers: safeHeaders
                },
                response: {
                    code: error.response?.status || 500,
                    headers: redactHeaders({ headers: error.response?.headers })
                },
                error: {
                    name: error.name,
                    message: error.message,
                    payload: {
                        code: error.code
                        // data: error.response?.data, contains too much data
                    }
                },
                retry: retryAttempt
            });
        } else {
            await this.logger({
                type: 'http',
                level: 'error',
                source: 'internal',
                createdAt: start.toISOString(),
                endedAt: new Date().toISOString(),
                message: `${this.config.method} ${redactedURL}`,
                error: error as any,
                retry: retryAttempt
            });
        }
    }

    private async logResponse({
        response,
        axiosConfig,
        retryAttempt,
        start
    }: {
        response: AxiosResponse;
        axiosConfig: AxiosRequestConfig;
        retryAttempt: RetryAttemptArgument;
        start: Date;
    }): Promise<void> {
        const valuesToFilter = Object.values(this.config.connection.credentials);
        const safeHeaders = redactHeaders({ headers: axiosConfig.headers, valuesToFilter });
        const redactedURL = redactURL({ url: axiosConfig.url!, valuesToFilter });
        await this.logger({
            type: 'http',
            level: 'info',
            source: 'internal',
            createdAt: start.toISOString(),
            endedAt: new Date().toISOString(),
            message: `${this.config.method} ${redactedURL}`,
            request: {
                method: this.config.method,
                url: redactedURL,
                headers: safeHeaders
            },
            response: {
                code: response.status,
                headers: redactHeaders({ headers: response.headers })
            },
            retry: retryAttempt
        });
    }
}
