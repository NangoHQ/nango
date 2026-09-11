import { PassThrough, Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import * as shared from '@nangohq/shared';
import { Err, metrics, Ok } from '@nangohq/utils';

import { capping } from '../utils/usage.js';
import proxyService from './proxy.service.js';

import type { LogContext, LogContextOrigin } from '@nangohq/logs';
import type { Config } from '@nangohq/shared';
import type { DBConnectionDecrypted, DBEnvironment, DBTeam } from '@nangohq/types';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

describe('proxyService', () => {
    const logCtx = {
        id: 'proxy-log-id',
        enrichOperation: vi.fn(),
        error: vi.fn(),
        failed: vi.fn(),
        success: vi.fn(),
        log: vi.fn()
    } as unknown as LogContext;

    beforeEach(() => {
        vi.spyOn(logContextGetter, 'create').mockResolvedValue(logCtx as unknown as LogContextOrigin);
        vi.spyOn(capping, 'getStatus').mockResolvedValue({ isCapped: false } as Awaited<ReturnType<typeof capping.getStatus>>);
        vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        vi.spyOn(shared.pubsub.publisher, 'publish').mockResolvedValue(Ok(undefined));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.mocked(logCtx.enrichOperation).mockClear();
        vi.mocked(logCtx.error).mockClear();
        vi.mocked(logCtx.failed).mockClear();
        vi.mocked(logCtx.success).mockClear();
    });

    it('executes a provider request and returns transport-neutral response data', async () => {
        const integration = integrationFixture();
        const connection = connectionFixture();
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
        vi.spyOn(shared.connectionService, 'getConnection').mockResolvedValue({ success: true, error: null, response: connection });
        vi.spyOn(shared, 'refreshOrTestCredentials').mockResolvedValue(Ok(connection));
        const requestSpy = vi.spyOn(shared.ProxyRequest.prototype, 'request').mockImplementation(function (this: shared.ProxyRequest) {
            expect(this.config).toMatchObject({
                endpoint: '/users/octocat',
                method: 'POST',
                providerConfigKey: 'github',
                headers: { 'x-custom': 'value' },
                data: { active: true },
                retries: 2,
                decompress: true,
                retryOn: [429, 503],
                forwardHeadersOnRedirect: false
            });
            return Promise.resolve(Ok(axiosResponse(201, { 'content-type': 'application/json', 'x-request-id': 'request-id' }, '{"created":true}')));
        });

        const execution = await proxyService.request({
            account: accountFixture(),
            environment: environmentFixture(),
            plan: null,
            method: 'POST',
            endpoint: '/users/octocat',
            integrationId: 'github',
            connectionId: 'connection-id',
            headers: { 'X-Custom': 'value' },
            body: { active: true },
            retries: 2,
            decompress: true,
            retryOn: [429, 503],
            forwardHeadersOnRedirect: false
        });

        expect(requestSpy).toHaveBeenCalledOnce();
        expect(execution.result.isOk()).toBe(true);
        if (execution.result.isOk()) {
            expect(execution.result.value).toMatchObject({
                outcome: 'success',
                status: 201,
                headers: { 'content-type': 'application/json', 'x-request-id': 'request-id' }
            });
            expect(await readBody(execution.result.value.body)).toBe('{"created":true}');
            expect(logCtx.success).not.toHaveBeenCalled();
            await execution.result.value.complete();
            await execution.result.value.complete(new Error('late transport failure'));
        }
        expect(logCtx.enrichOperation).toHaveBeenCalledWith({
            integrationId: 10,
            integrationName: 'github',
            providerName: 'github',
            connectionId: 20,
            connectionName: 'connection-id'
        });
        expect(logCtx.success).toHaveBeenCalledOnce();
        expect(logCtx.failed).not.toHaveBeenCalled();
        expect(metrics.increment).toHaveBeenCalledWith(metrics.Types.PROXY, 1, { accountId: 1, providerConfigKey: 'github' });
        expect(metrics.increment).toHaveBeenCalledWith(metrics.Types.PROXY_SUCCESS, 1, { providerConfigKey: 'github' });
        expect(capping.getStatus).toHaveBeenCalledWith(null, 'proxy', 'data_transfer');
    });

    it('returns a domain error when the integration does not exist', async () => {
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(null);
        const connectionSpy = vi.spyOn(shared.connectionService, 'getConnection');

        const execution = await proxyService.request({
            account: accountFixture(),
            environment: environmentFixture(),
            plan: null,
            method: 'GET',
            endpoint: '/users/octocat',
            integrationId: 'missing',
            connectionId: 'connection-id'
        });

        expect(execution.result.isErr()).toBe(true);
        if (execution.result.isErr()) {
            expect(execution.result.error).toMatchObject({
                code: 'unknown_integration',
                status: 404,
                message: expect.stringContaining('Provider config not found')
            });
        }
        expect(connectionSpy).not.toHaveBeenCalled();
        expect(logCtx.failed).toHaveBeenCalledOnce();
        expect(metrics.increment).toHaveBeenCalledWith(metrics.Types.PROXY_FAILURE, 1, { providerConfigKey: 'missing' });
    });

    it('preserves legacy failure metric exclusions for missing connections', async () => {
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integrationFixture());
        vi.spyOn(shared.connectionService, 'getConnection').mockResolvedValue({
            success: false,
            error: new shared.NangoError('unknown_connection'),
            response: null
        });

        const execution = await proxyService.request({
            account: accountFixture(),
            environment: environmentFixture(),
            plan: null,
            method: 'GET',
            endpoint: '/users/octocat',
            integrationId: 'github',
            connectionId: 'missing'
        });

        expect(execution.result.isErr()).toBe(true);
        if (execution.result.isErr()) {
            expect(execution.result.error.code).toBe('connection_not_found');
        }
        expect(metrics.increment).not.toHaveBeenCalledWith(metrics.Types.PROXY_FAILURE, 1, { providerConfigKey: 'github' });
    });

    it('preserves legacy failure metric exclusions for credential refresh backoff', async () => {
        const connection = connectionFixture();
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integrationFixture());
        vi.spyOn(shared.connectionService, 'getConnection').mockResolvedValue({ success: true, error: null, response: connection });
        vi.spyOn(shared, 'refreshOrTestCredentials').mockResolvedValue(Err(new shared.NangoError('connection_refresh_backoff')));

        const execution = await proxyService.request({
            account: accountFixture(),
            environment: environmentFixture(),
            plan: null,
            method: 'GET',
            endpoint: '/users/octocat',
            integrationId: 'github',
            connectionId: 'connection-id'
        });

        expect(execution.result.isErr()).toBe(true);
        if (execution.result.isErr()) {
            expect(execution.result.error.code).toBe('connection_refresh_backoff');
        }
        expect(metrics.increment).not.toHaveBeenCalledWith(metrics.Types.PROXY_FAILURE, 1, { providerConfigKey: 'github' });
    });

    it('cancels the provider response when its consumer aborts', async () => {
        const integration = integrationFixture();
        const connection = connectionFixture();
        const providerBody = new PassThrough();
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
        vi.spyOn(shared.connectionService, 'getConnection').mockResolvedValue({ success: true, error: null, response: connection });
        vi.spyOn(shared, 'refreshOrTestCredentials').mockResolvedValue(Ok(connection));
        vi.spyOn(shared.ProxyRequest.prototype, 'request').mockResolvedValue(
            Ok({
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'text/plain' },
                config: {} as InternalAxiosRequestConfig,
                data: providerBody
            })
        );

        const execution = await proxyService.request({
            account: accountFixture(),
            environment: environmentFixture(),
            plan: null,
            method: 'GET',
            endpoint: '/large-response',
            integrationId: 'github',
            connectionId: 'connection-id'
        });

        expect(execution.result.isOk()).toBe(true);
        if (execution.result.isOk()) {
            execution.result.value.body.destroy();
        }
        await vi.waitFor(() => {
            expect(providerBody.destroyed).toBe(true);
            expect(logCtx.failed).toHaveBeenCalledOnce();
        });
        expect(logCtx.success).not.toHaveBeenCalled();
    });

    it('normalizes provider HTTP failures as responses for each transport to format', async () => {
        const integration = integrationFixture();
        const connection = connectionFixture();
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
        vi.spyOn(shared.connectionService, 'getConnection').mockResolvedValue({ success: true, error: null, response: connection });
        vi.spyOn(shared, 'refreshOrTestCredentials').mockResolvedValue(Ok(connection));
        vi.spyOn(shared.ProxyRequest.prototype, 'request').mockResolvedValue(
            Err(
                Object.assign(new Error('Not found'), {
                    name: 'AxiosError',
                    isAxiosError: true,
                    response: axiosResponse(404, { 'content-type': 'application/json' }, '{"error":"missing"}')
                })
            )
        );

        const execution = await proxyService.request({
            account: accountFixture(),
            environment: environmentFixture(),
            plan: null,
            method: 'GET',
            endpoint: '/missing',
            integrationId: 'github',
            connectionId: 'connection-id'
        });

        expect(execution.result.isOk()).toBe(true);
        if (execution.result.isOk()) {
            expect(execution.result.value).toMatchObject({ outcome: 'upstream_error', status: 404 });
            expect(await readBody(execution.result.value.body)).toBe('{"error":"missing"}');
        }
        expect(logCtx.failed).toHaveBeenCalledOnce();
        expect(logCtx.success).not.toHaveBeenCalled();
    });

    it('normalizes Axios failures without response bodies', async () => {
        const integration = integrationFixture('telegram');
        const connection = connectionFixture();
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
        vi.spyOn(shared.connectionService, 'getConnection').mockResolvedValue({ success: true, error: null, response: connection });
        vi.spyOn(shared, 'refreshOrTestCredentials').mockResolvedValue(Ok(connection));
        const error = Object.assign(new Error('Bad gateway'), {
            name: 'AxiosError',
            isAxiosError: true,
            code: 'ERR_BAD_RESPONSE',
            status: 502,
            config: { method: 'GET' },
            response: { status: 502, statusText: 'Bad Gateway', headers: { 'x-request-id': 'request-id' } }
        });
        vi.spyOn(shared.ProxyRequest.prototype, 'httpCall').mockImplementation((config) => {
            expect(config.url).toContain('secret');
            return Promise.reject(error);
        });

        const execution = await proxyService.request({
            account: accountFixture(),
            environment: environmentFixture(),
            plan: null,
            method: 'GET',
            endpoint: '/unavailable',
            integrationId: 'github',
            connectionId: 'connection-id'
        });

        expect(execution.result.isOk()).toBe(true);
        if (execution.result.isOk()) {
            expect(execution.result.value).toMatchObject({
                outcome: 'upstream_error',
                status: 502,
                headers: { 'content-type': 'application/json', 'x-request-id': 'request-id' }
            });
            const body = JSON.parse(await readBody(execution.result.value.body)) as Record<string, unknown>;
            expect(body).toMatchObject({
                message: 'Bad gateway',
                code: 'ERR_BAD_RESPONSE',
                status: 502,
                method: 'GET'
            });
            expect(body).not.toHaveProperty('stack');
            expect(body).not.toHaveProperty('url');
            expect(JSON.stringify(body)).not.toContain('secret');
        }
    });

    it('keeps proxy policy failures as public domain errors', async () => {
        const integration = integrationFixture();
        const connection = connectionFixture();
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integration);
        vi.spyOn(shared.connectionService, 'getConnection').mockResolvedValue({ success: true, error: null, response: connection });
        vi.spyOn(shared, 'refreshOrTestCredentials').mockResolvedValue(Ok(connection));
        const cause = new shared.ProxyError('proxy_redirect_to_denied_host', 'blocked');
        vi.spyOn(shared.ProxyRequest.prototype, 'request').mockResolvedValue(Err(new Error('Redirect aborted', { cause })));

        const execution = await proxyService.request({
            account: accountFixture(),
            environment: environmentFixture(),
            plan: null,
            method: 'GET',
            endpoint: '/redirect',
            integrationId: 'github',
            connectionId: 'connection-id'
        });

        expect(execution.result.isErr()).toBe(true);
        if (execution.result.isErr()) {
            expect(execution.result.error).toMatchObject({
                code: 'base_url_override_not_allowed',
                status: 400,
                message: 'This base URL override is not allowed by server configuration.'
            });
        }
    });
});

function axiosResponse(status: number, headers: Record<string, string>, body: string): AxiosResponse {
    return {
        status,
        statusText: '',
        headers,
        config: {} as InternalAxiosRequestConfig,
        data: Readable.from([body])
    };
}

async function readBody(body: NodeJS.ReadableStream): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
}

function accountFixture(): DBTeam {
    return { id: 1, uuid: 'account-uuid' } as DBTeam;
}

function environmentFixture(): DBEnvironment {
    return { id: 2, name: 'dev' } as DBEnvironment;
}

function integrationFixture(provider = 'github'): Config {
    return {
        id: 10,
        unique_key: 'github',
        provider,
        custom: null,
        oauth_client_id: null,
        oauth_client_secret: null
    } as unknown as Config;
}

function connectionFixture(): DBConnectionDecrypted {
    return {
        id: 20,
        connection_id: 'connection-id',
        provider_config_key: 'github',
        connection_config: {},
        metadata: null,
        credentials: { type: 'API_KEY', apiKey: 'secret' }
    } as DBConnectionDecrypted;
}
