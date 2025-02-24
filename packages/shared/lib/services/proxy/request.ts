import { isAxiosError } from 'axios';
import type { AxiosResponse, AxiosRequestConfig } from 'axios';
import type { Result, RetryAttemptArgument } from '@nangohq/utils';
import { axiosInstance as axios, Err, Ok, redactHeaders, redactURL, retryFlexible } from '@nangohq/utils';

import type { ApplicationConstructedProxyConfiguration, MaybePromise, MessageRowInsert } from '@nangohq/types';
import { getAxiosConfiguration, ProxyError } from './utils.js';
import { getProxyRetryFromErr } from './retry.js';

type Props = {
    logger: (msg: MessageRowInsert) => MaybePromise<void>;
    onError?: (args: { err: unknown; max: number; attempt: number }) => { retry: boolean; reason: string; wait?: number };
} & (
    | {
          proxyConfig: ApplicationConstructedProxyConfiguration;
      }
    | {
          getProxyConfig: () => MaybePromise<ApplicationConstructedProxyConfiguration>;
      }
);

/**
 * This simple class is responsible to execute a call to a third-party
 * It's handling the logging and retry, nothing else.
 *
 * It's the same code for the SDK and for the Proxy API.
 */
export class ProxyRequest {
    logger: Props['logger'];

    /**
     * Called before each tries to re-build proxy config
     */
    getProxyConfig?: () => MaybePromise<ApplicationConstructedProxyConfiguration>;

    /**
     * Called on error, gives the ability to control the retry and wait time
     */
    onError?: Props['onError'];

    /**
     * Either supplied in the constructor or build at each iteration if getProxyConfig is specified
     */
    config?: ApplicationConstructedProxyConfiguration;

    /**
     * Re-build at each iteration if getProxyConfig is specified
     */
    axiosConfig?: AxiosRequestConfig;

    constructor(props: Props) {
        this.logger = props.logger;
        this.onError = props.onError;

        if ('proxyConfig' in props) {
            this.config = props.proxyConfig;
        } else if ('getProxyConfig' in props) {
            this.getProxyConfig = props.getProxyConfig;
        }
    }

    /**
     * Send a request to the third-party with retry.
     */
    public async request(): Promise<Result<AxiosResponse>> {
        if (this.getProxyConfig) {
            this.config = await this.getProxyConfig();
        }
        if (!this.config) {
            throw new ProxyError('unknown_error', 'Failed to build proxy configuration');
        }

        this.axiosConfig = getAxiosConfiguration({ proxyConfig: this.config });

        try {
            const response = await retryFlexible<Promise<AxiosResponse>>(
                async (retryAttempt) => {
                    const start = new Date();

                    // Dynamically re-build proxy and axios config
                    // Useful for example to refresh connection's credentials
                    if (retryAttempt.attempt > 0 && this.getProxyConfig) {
                        this.config = await this.getProxyConfig();
                        this.axiosConfig = getAxiosConfiguration({ proxyConfig: this.config });
                    }

                    try {
                        const res = await axios.request(this.axiosConfig!);
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

    private async logErrorResponse({ error, retryAttempt, start }: { error: unknown; retryAttempt: RetryAttemptArgument; start: Date }): Promise<void> {
        const config = this.config!;
        const axiosConfig = this.axiosConfig!;
        const valuesToFilter = Object.values(config.connection.credentials);
        const redactedURL = redactURL({ url: axiosConfig.url!, valuesToFilter });

        if (isAxiosError(error)) {
            const safeHeaders = redactHeaders({ headers: axiosConfig.headers, valuesToFilter });
            await this.logger({
                type: 'http',
                level: 'error',
                source: 'internal',
                createdAt: start.toISOString(),
                endedAt: new Date().toISOString(),
                message: `${config.method} ${redactedURL}`,
                request: {
                    method: config.method,
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
                message: `${config.method} ${redactedURL}`,
                error: error as any,
                retry: retryAttempt
            });
        }
    }

    private async logResponse({ response, retryAttempt, start }: { response: AxiosResponse; retryAttempt: RetryAttemptArgument; start: Date }): Promise<void> {
        const config = this.config!;
        const axiosConfig = this.axiosConfig!;

        const valuesToFilter = Object.values(config.connection.credentials);
        const safeHeaders = redactHeaders({ headers: axiosConfig.headers, valuesToFilter });
        const redactedURL = redactURL({ url: axiosConfig.url!, valuesToFilter });

        await this.logger({
            type: 'http',
            level: 'info',
            source: 'internal',
            createdAt: start.toISOString(),
            endedAt: new Date().toISOString(),
            message: `${config.method} ${redactedURL}`,
            request: {
                method: config.method,
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
