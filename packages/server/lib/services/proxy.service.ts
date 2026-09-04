import { Readable } from 'node:stream';

import { isAxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';

import { logContextGetter, LogContextOrigin, OtlpSpan } from '@nangohq/logs';
import {
    configService,
    connectionService,
    enforceProxyOutboundUrlPolicy,
    errorManager,
    ErrorSourceEnum,
    findOutboundUrlError,
    getProvider,
    getProxyConfiguration,
    getServerOutboundUrlPolicy,
    LogActionEnum,
    makeDataTransferEvent,
    ProxyError,
    ProxyRequest,
    pubsub,
    refreshOrTestCredentials
} from '@nangohq/shared';
import { Err, getLogger, isBaseUrlOverrideDenied, metrics, normalizeDenylist, Ok } from '@nangohq/utils';

import { envs } from '../env.js';
import { connectionRefreshFailed, connectionRefreshSuccess } from '../hooks/hooks.js';
import { capping } from '../utils/usage.js';

import type { LogContext } from '@nangohq/logs';
import type { DBEnvironment, DBPlan, DBTeam, HTTP_METHOD, InternalProxyConfiguration, ProxyFile, Result } from '@nangohq/types';
import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

const MEMOIZED_CONNECTION_TTL = 60_000;
const defaultLogger = getLogger('Server.ProxyService');
const baseUrlOverrideDenylist = normalizeDenylist(envs.NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST);

export interface ProxyServiceRequest {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
    method: HTTP_METHOD;
    endpoint: string;
    integrationId: string;
    connectionId: string;
    headers?: Record<string, string> | undefined;
    body?: unknown;
    files?: ProxyFile[] | undefined;
    retries?: number | undefined;
    baseUrlOverride?: string | undefined;
    decompress?: boolean | undefined;
    retryOn?: number[] | null | undefined;
    forwardHeadersOnRedirect?: boolean | undefined;
    activityLogId?: string | undefined;
    isSync?: boolean | undefined;
    isDryRun?: boolean | undefined;
}

export interface ProxyServiceResponseHeaders extends Record<string, unknown> {
    'content-disposition'?: string | undefined;
    'transfer-encoding'?: string | undefined;
}

export interface ProxyServiceResponse {
    outcome: 'success' | 'upstream_error';
    status: number;
    headers: ProxyServiceResponseHeaders;
    body: Readable;
    wasCompressed?: boolean | undefined;
    complete(error?: Error): Promise<void>;
}

export type ProxyServiceErrorCode =
    | 'base_url_override_disabled'
    | 'base_url_override_not_allowed'
    | 'plan_limit'
    | 'unknown_integration'
    | 'connection_not_found'
    | 'connection_refresh_backoff'
    | 'credentials_refresh_failed'
    | 'proxy_request_failed'
    | 'internal_error';

const shouldIncrementFailureMetric = {
    base_url_override_disabled: true,
    base_url_override_not_allowed: true,
    plan_limit: false,
    unknown_integration: true,
    connection_not_found: false,
    connection_refresh_backoff: false,
    credentials_refresh_failed: true,
    proxy_request_failed: true,
    internal_error: true
} satisfies Record<ProxyServiceErrorCode, boolean>;

export class ProxyServiceError extends Error {
    public readonly code: ProxyServiceErrorCode;
    public readonly status: number;
    public readonly providerCode?: string | undefined;

    constructor({
        code,
        message,
        status,
        providerCode,
        cause
    }: {
        code: ProxyServiceErrorCode;
        message: string;
        status: number;
        providerCode?: string | undefined;
        cause?: unknown;
    }) {
        super(message, { cause });
        this.name = 'ProxyServiceError';
        this.code = code;
        this.status = status;
        this.providerCode = providerCode;
    }
}

export interface ProxyServiceExecution {
    logCtx?: LogContext | undefined;
    result: Result<ProxyServiceResponse, ProxyServiceError>;
}

interface ProxyServiceLogger {
    warning(message: string, metadata?: Record<string, unknown>): void;
}

export class ProxyService {
    constructor(private readonly logger: ProxyServiceLogger = defaultLogger) {}

    async request(params: ProxyServiceRequest): Promise<ProxyServiceExecution> {
        const { account, environment } = params;
        let logCtx: LogContext | undefined;

        try {
            if (!params.isSync) {
                metrics.increment(metrics.Types.PROXY, 1, { accountId: account.id, providerConfigKey: params.integrationId });
            }

            logCtx = params.activityLogId
                ? logContextGetter.get({ id: params.activityLogId, accountId: account.id })
                : await logContextGetter.create(
                      { operation: { type: 'proxy', action: 'call' } },
                      { account, environment },
                      params.isDryRun !== undefined ? { dryRun: params.isDryRun } : undefined
                  );

            if (logCtx instanceof LogContextOrigin) {
                logCtx.attachSpan(new OtlpSpan(logCtx.operation));
            }

            const requestOverrideError = this.validateBaseUrlOverride({
                baseUrl: params.baseUrlOverride,
                accountId: account.id,
                providerConfigKey: params.integrationId,
                disabledMessage: 'Base URL override is disabled by server configuration.',
                deniedMessage: 'This base URL override is not allowed by server configuration.'
            });
            if (requestOverrideError) {
                return await this.fail(logCtx, requestOverrideError, params.integrationId);
            }

            const cappingStatus = await capping.getStatus(params.plan, 'proxy', 'data_transfer');
            if (cappingStatus.isCapped) {
                return await this.fail(
                    logCtx,
                    new ProxyServiceError({
                        code: 'plan_limit',
                        message: cappingStatus.message || 'Your plan limits have been reached. Please upgrade your plan.',
                        status: 402
                    }),
                    params.integrationId,
                    { cappingStatus }
                );
            }

            const integration = await configService.getProviderConfig(params.integrationId, environment.id);
            if (!integration) {
                return await this.fail(
                    logCtx,
                    new ProxyServiceError({
                        code: 'unknown_integration',
                        message:
                            'Provider config not found for the given provider config key. Please make sure the provider config exists in the Nango dashboard.',
                        status: 404
                    }),
                    params.integrationId
                );
            }
            const integrationDatabaseId = integration.id;
            if (typeof integrationDatabaseId !== 'number') {
                return await this.fail(
                    logCtx,
                    new ProxyServiceError({ code: 'internal_error', message: 'Proxy integration is missing its database ID', status: 500 }),
                    params.integrationId
                );
            }

            // An explicit request override takes precedence over an integration's custom base URL.
            const provider = getProvider(integration.provider);
            const customBaseUrl = !params.baseUrlOverride && provider?.integration_config ? integration.custom?.['baseUrl'] : undefined;
            const integrationOverrideError = this.validateBaseUrlOverride({
                baseUrl: customBaseUrl,
                accountId: account.id,
                providerConfigKey: params.integrationId,
                disabledMessage: 'Base URL override is disabled by server configuration.',
                deniedMessage: 'This base URL is not allowed by server configuration.'
            });
            if (integrationOverrideError) {
                return await this.fail(logCtx, integrationOverrideError, params.integrationId);
            }

            const connectionResult = await connectionService.getConnection(params.connectionId, params.integrationId, environment.id);
            if (connectionResult.error || !connectionResult.response) {
                return await this.fail(
                    logCtx,
                    new ProxyServiceError({ code: 'connection_not_found', message: 'Failed to get connection', status: 400, cause: connectionResult.error }),
                    params.integrationId
                );
            }

            const credentialResponse = await refreshOrTestCredentials({
                account,
                environment,
                connection: connectionResult.response,
                integration,
                logContextGetter,
                instantRefresh: false,
                onRefreshSuccess: connectionRefreshSuccess,
                onRefreshFailed: connectionRefreshFailed
            });
            if (credentialResponse.isErr()) {
                const error = credentialResponse.error;
                return await this.fail(
                    logCtx,
                    error.type === 'connection_refresh_backoff'
                        ? new ProxyServiceError({ code: 'connection_refresh_backoff', message: error.message, status: error.status, cause: error })
                        : new ProxyServiceError({
                              code: 'credentials_refresh_failed',
                              message: `Failed to get connection credentials: '${error.message}'`,
                              status: error.status,
                              cause: error
                          }),
                    params.integrationId
                );
            }

            const connection = credentialResponse.value;
            await logCtx.enrichOperation({
                integrationId: integrationDatabaseId,
                integrationName: integration.unique_key,
                providerName: integration.provider,
                connectionId: connection.id,
                connectionName: connection.connection_id
            });

            const internalConfig: InternalProxyConfiguration = { providerName: integration.provider };
            const proxyConfig = getProxyConfiguration({
                externalConfig: {
                    endpoint: params.endpoint,
                    providerConfigKey: params.integrationId,
                    retries: params.retries ?? 0,
                    data: params.body,
                    files: params.files ?? [],
                    headers: params.headers ?? {},
                    baseUrlOverride: params.baseUrlOverride,
                    decompress: params.decompress ?? false,
                    method: params.method,
                    retryOn: params.retryOn ?? null,
                    responseType: 'stream',
                    ...(params.forwardHeadersOnRedirect !== undefined ? { forwardHeadersOnRedirect: params.forwardHeadersOnRedirect } : {}),
                    ...(!envs.NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED || baseUrlOverrideDenylist.size > 0
                        ? {
                              validateProxyRequestUrl: ({ absoluteUrl, proxyConfig, connection, integrationConfig }) => {
                                  enforceProxyOutboundUrlPolicy({
                                      absoluteUrl,
                                      proxyConfig,
                                      connection,
                                      ...(integrationConfig !== undefined ? { integrationConfig } : {}),
                                      overrideEnabled: envs.NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED,
                                      denylist: baseUrlOverrideDenylist
                                  });
                              },
                              validateProxyRedirectUrl: (absoluteUrl: string) => {
                                  if (!isBaseUrlOverrideDenied(absoluteUrl, baseUrlOverrideDenylist)) {
                                      return;
                                  }

                                  metrics.increment(metrics.Types.PROXY_BASE_URL_OVERRIDE_DENIED, 1, {
                                      accountId: account.id,
                                      providerConfigKey: params.integrationId
                                  });
                                  this.logger.warning('Proxy redirect to denylisted host blocked', {
                                      accountId: account.id,
                                      providerConfigKey: params.integrationId,
                                      connectionId: params.connectionId,
                                      redirectHost: safeHostname(absoluteUrl)
                                  });
                                  throw new ProxyError('proxy_redirect_to_denied_host', 'This redirect target is not allowed by server configuration.');
                              }
                          }
                        : {})
                },
                internalConfig
            });
            if (proxyConfig.isErr()) {
                this.publishUsage(params, connection.connection_id, logCtx.id, false);
                return await this.fail(logCtx, proxyErrorToServiceError(proxyConfig.error), params.integrationId);
            }

            let lastConnectionRefresh = Date.now();
            let freshConnection = connection;
            const proxy = new ProxyRequest({
                proxyConfig: proxyConfig.value,
                outboundPolicy: getServerOutboundUrlPolicy(),
                logger: (message) => {
                    void logCtx?.log(message);
                },
                getConnection: async () => {
                    if (Date.now() - lastConnectionRefresh < MEMOIZED_CONNECTION_TTL) {
                        return freshConnection;
                    }

                    lastConnectionRefresh = Date.now();
                    const refreshResult = await refreshOrTestCredentials({
                        account,
                        environment,
                        connection,
                        integration,
                        logContextGetter,
                        instantRefresh: false,
                        onRefreshSuccess: connectionRefreshSuccess,
                        onRefreshFailed: connectionRefreshFailed
                    });
                    if (refreshResult.isErr()) {
                        throw new ProxyError('failed_to_get_connection', 'Failed to get connection credentials', refreshResult.error);
                    }

                    freshConnection = refreshResult.value;
                    return freshConnection;
                },
                getIntegrationConfig: () => ({
                    oauth_client_id: integration.oauth_client_id,
                    oauth_client_secret: integration.oauth_client_secret,
                    custom: integration.custom
                }),
                onBytes: (meteredBytes) => {
                    void pubsub.publisher.publish(
                        makeDataTransferEvent({
                            pkg: 'server',
                            callsite: 'proxy',
                            accountId: account.id,
                            connectionId: connection.connection_id,
                            integrationId: params.integrationId,
                            environmentId: environment.id,
                            environmentName: environment.name,
                            meteredBytes
                        })
                    );
                }
            });

            const proxyResult = await proxy.request();
            this.publishUsage(params, connection.connection_id, logCtx.id, proxyResult.isOk());

            if (proxyResult.isOk()) {
                const response = this.toServiceResponse({
                    response: proxyResult.value,
                    outcome: 'success',
                    params,
                    logCtx
                });
                return { logCtx, result: Ok(response) };
            }

            const proxyServiceError = proxyErrorToServiceError(proxyResult.error);
            if (proxyServiceError.code !== 'internal_error') {
                return await this.fail(logCtx, proxyServiceError, params.integrationId);
            }

            const upstreamResponse = axiosErrorResponse(proxyResult.error, proxy.axiosConfig);
            if (upstreamResponse) {
                await logCtx.failed();
                metrics.increment(metrics.Types.PROXY_FAILURE, 1, { providerConfigKey: params.integrationId });
                const response = this.toServiceResponse({
                    response: upstreamResponse,
                    outcome: 'upstream_error',
                    params,
                    logCtx
                });
                return { logCtx, result: Ok(response) };
            }

            return await this.fail(logCtx, proxyServiceError, params.integrationId);
        } catch (err) {
            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.PROXY,
                environmentId: environment.id,
                metadata: { connectionId: params.connectionId, providerConfigKey: params.integrationId }
            });
            if (logCtx) {
                void logCtx.error('uncaught error', { error: err });
                await logCtx.failed();
            }
            metrics.increment(metrics.Types.PROXY_FAILURE, 1, { providerConfigKey: params.integrationId });
            return {
                logCtx,
                result: Err(new ProxyServiceError({ code: 'internal_error', message: 'Proxy request failed', status: 500, cause: err }))
            };
        }
    }

    private validateBaseUrlOverride({
        baseUrl,
        accountId,
        providerConfigKey,
        disabledMessage,
        deniedMessage
    }: {
        baseUrl: unknown;
        accountId: number;
        providerConfigKey: string;
        disabledMessage: string;
        deniedMessage: string;
    }): ProxyServiceError | undefined {
        if (!baseUrl) {
            return undefined;
        }
        if (!envs.NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED) {
            return new ProxyServiceError({ code: 'base_url_override_disabled', message: disabledMessage, status: 400 });
        }
        if (typeof baseUrl === 'string' && isBaseUrlOverrideDenied(baseUrl, baseUrlOverrideDenylist)) {
            metrics.increment(metrics.Types.PROXY_BASE_URL_OVERRIDE_DENIED, 1, { accountId, providerConfigKey });
            return new ProxyServiceError({ code: 'base_url_override_not_allowed', message: deniedMessage, status: 400 });
        }
        return undefined;
    }

    private toServiceResponse({
        response,
        outcome,
        params,
        logCtx
    }: {
        response: AxiosResponse;
        outcome: ProxyServiceResponse['outcome'];
        params: ProxyServiceRequest;
        logCtx: LogContext;
    }): ProxyServiceResponse {
        const complete = createResponseCompletion({ outcome, logCtx, providerConfigKey: params.integrationId });
        const body = toResponseBody({
            source: response.data,
            onError: (error) => {
                if (outcome === 'success') {
                    void logCtx.error('Failed to read provider response', { error });
                    void complete(error);
                }
            }
        });

        return {
            outcome,
            status: response.status,
            headers: Object.fromEntries(Object.entries(response.headers)),
            body,
            wasCompressed: checkWasCompressed(response),
            complete
        };
    }

    private async fail(
        logCtx: LogContext,
        error: ProxyServiceError,
        providerConfigKey: string,
        metadata?: Record<string, unknown>
    ): Promise<ProxyServiceExecution> {
        void logCtx.error(error.message, metadata ?? { error: error.cause });
        await logCtx.failed();
        if (shouldIncrementFailureMetric[error.code]) {
            metrics.increment(metrics.Types.PROXY_FAILURE, 1, { providerConfigKey });
        }
        return { logCtx, result: Err(error) };
    }

    private publishUsage(params: ProxyServiceRequest, providerConnectionId: string, activityLogId: string, success: boolean): void {
        void pubsub.publisher.publish({
            subject: 'usage',
            type: 'usage.proxy',
            idempotencyKey: params.activityLogId ? uuidv4() : activityLogId,
            payload: {
                value: 1,
                properties: {
                    accountId: params.account.id,
                    environmentId: params.environment.id,
                    environmentName: params.environment.name,
                    integrationId: params.integrationId,
                    connectionId: providerConnectionId,
                    success
                }
            }
        });
    }
}

function createResponseCompletion({
    outcome,
    logCtx,
    providerConfigKey
}: {
    outcome: ProxyServiceResponse['outcome'];
    logCtx: LogContext;
    providerConfigKey: string;
}): ProxyServiceResponse['complete'] {
    let completion: Promise<void> | undefined = outcome === 'upstream_error' ? Promise.resolve() : undefined;

    return (error?: Error) => {
        completion ??= (async () => {
            if (error) {
                await logCtx.failed();
                metrics.increment(metrics.Types.PROXY_FAILURE, 1, { providerConfigKey });
                return;
            }

            await logCtx.success();
            metrics.increment(metrics.Types.PROXY_SUCCESS, 1, { providerConfigKey });
        })();
        return completion;
    };
}

function toResponseBody({ source, onError }: { source: unknown; onError: (error: Error) => void }): Readable {
    const body = isReadable(source) ? source : Readable.from([toBuffer(source)]);
    let settled = false;
    const fail = (error: Error) => {
        if (settled) {
            return;
        }
        settled = true;
        onError(error);
    };
    body.once('end', () => {
        settled = true;
    });
    body.once('error', fail);
    body.once('close', () => {
        if (!body.readableEnded) {
            fail(new Error('Proxy response consumption was aborted'));
        }
    });
    return body;
}

function isReadable(value: unknown): value is Readable {
    return typeof value === 'object' && value !== null && 'pipe' in value && typeof value.pipe === 'function';
}

function toBuffer(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) {
        return value;
    }
    if (typeof value === 'string') {
        return Buffer.from(value);
    }
    return Buffer.from(JSON.stringify(value ?? ''));
}

function axiosErrorResponse(error: unknown, requestConfig: AxiosRequestConfig | undefined): AxiosResponse | undefined {
    if (!isAxiosError(error)) {
        return undefined;
    }
    if (error.response?.data) {
        return error.response;
    }

    return {
        status: error.response?.status ?? 500,
        statusText: error.response?.statusText ?? '',
        headers: { 'content-type': 'application/json', ...Object.fromEntries(Object.entries(error.response?.headers ?? {})) },
        config: (error.config ?? {}) as InternalAxiosRequestConfig,
        data: {
            message: error.message,
            code: error.code,
            status: error.status,
            method: error.config?.method ?? requestConfig?.method
        }
    };
}

function proxyErrorToServiceError(error: unknown): ProxyServiceError {
    const proxyError = proxyErrorFromErrorChain(error);
    if (proxyError?.code === 'proxy_redirect_to_denied_host') {
        return new ProxyServiceError({
            code: 'base_url_override_not_allowed',
            message: 'This base URL override is not allowed by server configuration.',
            status: 400,
            cause: error
        });
    }

    const outboundError = findOutboundUrlError(error);
    if (outboundError) {
        return new ProxyServiceError({
            code: 'base_url_override_not_allowed',
            message: 'This outbound URL is not allowed by server configuration.',
            status: 400,
            cause: error
        });
    }

    if (proxyError) {
        return new ProxyServiceError({
            code: 'proxy_request_failed',
            providerCode: proxyError.code,
            message: proxyError.message,
            status: 400,
            cause: error
        });
    }

    return new ProxyServiceError({ code: 'internal_error', message: 'Proxy request failed', status: 500, cause: error });
}

function proxyErrorFromErrorChain(error: unknown): ProxyError | null {
    let current: unknown = error;
    const seen = new Set<unknown>();
    while (current && typeof current === 'object' && !seen.has(current)) {
        seen.add(current);
        if (current instanceof ProxyError) {
            return current;
        }
        current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
    }
    return null;
}

function safeHostname(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return 'unparseable';
    }
}

function checkWasCompressed(response: AxiosResponse): boolean | undefined {
    if (response.headers['content-encoding']) {
        return true;
    }
    const request: unknown = response.request;
    if (typeof request !== 'object' || request === null || !('res' in request)) {
        return undefined;
    }
    const rawResponse: unknown = request.res;
    if (typeof rawResponse !== 'object' || rawResponse === null || !('rawHeaders' in rawResponse)) {
        return undefined;
    }
    const rawHeaders = rawResponse.rawHeaders;
    if (!rawHeaders || !Array.isArray(rawHeaders)) {
        return undefined;
    }
    const contentEncodingIndex = rawHeaders.findIndex((header: unknown) => typeof header === 'string' && header.toLowerCase() === 'content-encoding');
    return contentEncodingIndex !== -1 && contentEncodingIndex + 1 < rawHeaders.length && Boolean(rawHeaders[contentEncodingIndex + 1]);
}

export default new ProxyService();
