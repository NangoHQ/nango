import { isAxiosError } from 'axios';
import type { AxiosResponse, AxiosRequestConfig } from 'axios';
import type { Result, RetryAttemptArgument } from '@nangohq/utils';
import { axiosInstance as axios, Err, Ok, redactHeaders, redactURL, retryFlexible } from '@nangohq/utils';

import type { ApplicationConstructedProxyConfiguration, ConnectionForProxy, MaybePromise, MessageRowInsert } from '@nangohq/types';
import { getAxiosConfiguration, ProxyError } from './utils.js';
import { getProxyRetryFromErr } from './retry.js';

interface Props {
    proxyConfig: ApplicationConstructedProxyConfiguration;
    logger: (msg: MessageRowInsert) => MaybePromise<void>;
    onError?: (args: { err: unknown; max: number; attempt: number }) => { retry: boolean; reason: string; wait?: number };
    getConnection: () => MaybePromise<ConnectionForProxy>;
}

/**
 * This simple class is responsible to execute a call to a third-party
 * It's handling the logging and retry, nothing else.
 *
 * It's the same code for the SDK and for the Proxy API.
 */
export class ProxyRequest {
    logger: Props['logger'];

    config: Props['proxyConfig'];

    /**
     * Called before each tries to re-build proxy config
     */
    getConnection: Props['getConnection'];

    /**
     * Called on error, gives the ability to control the retry and wait time
     */
    onError?: Props['onError'];

    /**
     * Build at each iteration
     */
    axiosConfig?: AxiosRequestConfig;

    /**
     * Build at each iteration
     */
    connection?: ConnectionForProxy;

    constructor(props: Props) {
        this.config = props.proxyConfig;
        this.logger = props.logger;
        this.onError = props.onError;
        this.getConnection = props.getConnection;
    }

    /**
     * Send a request to the third-party with retry.
     */
    public async request(): Promise<Result<AxiosResponse>> {
        try {
            const response = await retryFlexible<Promise<AxiosResponse>>(
                async (retryAttempt) => {
                    // Dynamically re-build proxy and axios config
                    // Useful for example to refresh connection's credentials
                    this.connection = await this.getConnection();
                    this.axiosConfig = getAxiosConfiguration({ proxyConfig: this.config, connection: this.connection });

                    const start = new Date();
                    try {
                        const res = await this.httpCall(this.axiosConfig);
                        await this.logResponse({ response: res, retryAttempt, start });
                        return res;
                    } catch (err) {
                        await this.logErrorResponse({ error: err, retryAttempt, start });
                        throw err;
                    }
                },
                {
                    max: this.config.retries || 0,
                    onError: async ({ err, nextWait, max, attempt }) => {
                        let retry = getProxyRetryFromErr({ err, proxyConfig: this.config });

                        // Only call onError if it's an actionable error
                        if (retry.reason !== 'unknown_error' && this.onError) {
                            retry = this.onError({ err, max, attempt });
                        }

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

    /**
     * For testing purpose only
     * @private
     */
    public async httpCall(axiosConfig: AxiosRequestConfig): Promise<AxiosResponse> {
        return await axios.request(axiosConfig);
    }

    private async logErrorResponse({ error, retryAttempt, start }: { error: unknown; retryAttempt: RetryAttemptArgument; start: Date }): Promise<void> {
        const valuesToFilter = this.connection ? Object.values(this.connection.credentials) : [];
        const redactedURL = redactURL({ url: this.axiosConfig?.url || '', valuesToFilter });
        const endedAt = new Date();

        if (isAxiosError(error)) {
            const safeHeaders = redactHeaders({ headers: this.axiosConfig?.headers, valuesToFilter });
            await this.logger({
                type: 'http',
                level: 'error',
                source: 'internal',
                context: 'proxy',
                createdAt: start.toISOString(),
                endedAt: endedAt.toISOString(),
                durationMs: endedAt.getTime() - start.getTime(),
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
                context: 'proxy',
                createdAt: start.toISOString(),
                endedAt: endedAt.toISOString(),
                durationMs: endedAt.getTime() - start.getTime(),
                message: `${this.config.method} ${redactedURL}`,
                error: error as any,
                retry: retryAttempt
            });
        }
    }

    private async logResponse({ response, retryAttempt, start }: { response: AxiosResponse; retryAttempt: RetryAttemptArgument; start: Date }): Promise<void> {
        const valuesToFilter = this.connection ? Object.values(this.connection.credentials) : [];
        const safeHeaders = redactHeaders({ headers: this.axiosConfig?.headers, valuesToFilter });
        const redactedURL = redactURL({ url: this.axiosConfig?.url || '', valuesToFilter });
        const endedAt = new Date();

        await this.logger({
            type: 'http',
            level: 'info',
            source: 'internal',
            context: 'proxy',
            createdAt: start.toISOString(),
            endedAt: endedAt.toISOString(),
            durationMs: endedAt.getTime() - start.getTime(),
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
