import { finished, Readable } from 'node:stream';

import { isAxiosError } from 'axios';

import { axiosInstance as axios, Err, getLogger, Ok, redactHeaders, redactURL, retryFlexible } from '@nangohq/utils';

import { createMeteringTransport } from './byte-metering-transport.js';
import { getProxyRetryFromErr } from './retry.js';
import { getAxiosConfiguration, ProxyError } from './utils.js';

import type { MeteredBytes } from './byte-metering-transport.js';
import type { RetryReason } from './utils.js';
import type { OutboundUrlPolicy } from '@nangohq/egress';
import type { ApplicationConstructedProxyConfiguration, ConnectionForProxy, IntegrationConfigForProxy, MaybePromise, MessageRowInsert } from '@nangohq/types';
import type { Result, RetryAttemptArgument } from '@nangohq/utils';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

const logger = getLogger('proxy:metering');

interface Props {
    proxyConfig: ApplicationConstructedProxyConfiguration;
    logger: (msg: MessageRowInsert) => MaybePromise<void>;
    onError?: (args: { err: unknown; max: number; attempt: number; retry: RetryReason }) => RetryReason;
    onBytes?: (bytes: MeteredBytes) => MaybePromise<void>;
    getConnection: () => MaybePromise<ConnectionForProxy>;
    getIntegrationConfig: () => MaybePromise<IntegrationConfigForProxy>;
    outboundPolicy?: OutboundUrlPolicy | undefined;
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
     * Called to get integration config only for Oauth1
     */
    getIntegrationConfig: Props['getIntegrationConfig'];

    /**
     * Called on error, gives the ability to control the retry and wait time
     */
    onError?: Props['onError'];

    /**
     * Called once per retry attempt with socket transfer bytes metered.
     */
    onBytes?: Props['onBytes'];

    /**
     * Build at each iteration
     */
    axiosConfig?: AxiosRequestConfig;

    /**
     * Build at each iteration
     */
    connection?: ConnectionForProxy;

    /**
     * Integration config only for Oauth1
     */
    integrationConfig?: IntegrationConfigForProxy | undefined;

    /**
     * Outbound URL SSRF policy applied to every request attempt (incl. redirect hops).
     */
    outboundPolicy?: Props['outboundPolicy'];

    constructor(props: Props) {
        this.config = props.proxyConfig;
        this.logger = props.logger;
        this.onError = props.onError;
        this.onBytes = props.onBytes;
        this.getConnection = props.getConnection;
        this.getIntegrationConfig = props.getIntegrationConfig;
        this.outboundPolicy = props.outboundPolicy;
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

                    const proxyHeaders = this.config.provider.proxy?.headers;
                    const headersNeedOAuthAppCredentials =
                        proxyHeaders &&
                        Object.values(proxyHeaders).some((v) => typeof v === 'string' && (v.includes('${clientId}') || v.includes('${clientSecret}')));

                    const needsIntegrationConfig = Boolean(this.config.provider.integration_config);
                    if (this.connection.credentials.type === 'OAUTH1' || headersNeedOAuthAppCredentials || needsIntegrationConfig) {
                        this.integrationConfig = await this.getIntegrationConfig();
                    }

                    this.axiosConfig = getAxiosConfiguration({
                        integrationConfig: this.integrationConfig,
                        proxyConfig: this.config,
                        connection: this.connection,
                        outboundPolicy: this.outboundPolicy
                    });

                    const byteTotals = { sent: 0, received: 0 };

                    if (this.onBytes) {
                        this.axiosConfig.transport = createMeteringTransport({
                            onBytes: (bytes) => {
                                byteTotals.sent += bytes.sent;
                                byteTotals.received += bytes.received;
                            },
                            beforeRedirect: this.axiosConfig.beforeRedirect as (opts: Record<string, unknown>) => void,
                            maxRedirects: this.axiosConfig.maxRedirects
                        });
                    }

                    const start = new Date();
                    let streamListenerAttached = false;
                    try {
                        const res = await this.httpCall(this.axiosConfig);

                        if (this.onBytes && res.data instanceof Readable) {
                            streamListenerAttached = true;

                            // we need to wait until the stream is finished before firing onBytes, otherwise
                            // we may end up undercounting bytes transferred
                            const cleanup = finished(res.data, () => {
                                this.fireOnBytes(byteTotals);
                                cleanup();
                            });
                        }

                        await this.logResponse({ response: res, retryAttempt, start });
                        return res;
                    } catch (err) {
                        await this.logErrorResponse({ error: err, retryAttempt, start });
                        throw err;
                    } finally {
                        if (this.onBytes && !streamListenerAttached) {
                            // safe to fire onBytes synchronously here, as we're not waiting for a stream to end
                            this.fireOnBytes(byteTotals);
                        }
                    }
                },
                {
                    max: this.config.retries || 0,
                    onError: async ({ err, nextWait, max, attempt }) => {
                        let retry = getProxyRetryFromErr({ err, proxyConfig: this.config });

                        // Only call onError if it's an actionable error
                        if (retry.reason !== 'unknown_error' && this.onError) {
                            retry = this.onError({ err, max, attempt, retry });
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

    private buildValuesToFilter(): string[] {
        const values: string[] = this.connection ? Object.values(this.connection.credentials).filter((v): v is string => typeof v === 'string') : [];
        if (this.integrationConfig?.oauth_client_secret) {
            values.push(this.integrationConfig.oauth_client_secret);
        }
        if (this.integrationConfig?.oauth_client_id) {
            values.push(this.integrationConfig.oauth_client_id);
        }
        return values;
    }

    private fireOnBytes(bytes: MeteredBytes): void {
        if (!this.onBytes) {
            return;
        }

        try {
            const result = this.onBytes(bytes);
            if (result && typeof (result as Promise<unknown>).then === 'function') {
                (result as Promise<unknown>).catch((err: unknown) => {
                    logger.error('Error in onBytes callback', err);
                });
            }
        } catch (err) {
            logger.error('Error in onBytes callback', err);
        }
    }

    private async logErrorResponse({ error, retryAttempt, start }: { error: unknown; retryAttempt: RetryAttemptArgument; start: Date }): Promise<void> {
        const valuesToFilter = this.buildValuesToFilter();
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
        const valuesToFilter = this.buildValuesToFilter();
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
