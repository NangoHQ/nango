import { Readable } from 'node:stream';

import { AxiosError } from 'axios';
import express from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';
import * as shared from '@nangohq/shared';
import { getExponentialBackoff, metrics, Ok } from '@nangohq/utils';

import { can } from '../../authz/middleware.js';
import { rateLimiterMiddleware } from '../../middleware/ratelimit.middleware.js';
import { capping } from '../../utils/usage.js';
import { allPublicProxy } from './allProxy.js';

import type { LogContext, LogContextOrigin } from '@nangohq/logs';
import type { Config } from '@nangohq/shared';
import type { ApiKeyPrincipal, DBEnvironment, DBTeam } from '@nangohq/types';
import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { Express, NextFunction, Request, Response } from 'express';
import type { MockInstance } from 'vitest';

/**
 * Spec for the public proxy retry limit. These tests fail while a customer key can set an
 * unbounded `retries` header, or while closing the client does not stop later attempts.
 * The management MCP proxy already rejects retries above five.
 */

const PROXY_RETRY_CAP = 5;
const RETRY_BACKOFF_MS = 3_000;
const ATTACKER_ORIGIN = 'https://attacker.example.com';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

let principalScopes: string[] = ['environment:*'];
let principalEnvironmentIds: number[] = [2];
let logMessages: string[] = [];
let httpCall: MockInstance<(config?: AxiosRequestConfig) => Promise<AxiosResponse>>;
let consume: MockInstance;

let url: string;
let close: () => Promise<void>;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function makeAxiosError(status: number): AxiosError {
    const err = new AxiosError(`Request failed with status code ${status}`);
    err.status = status;
    err.response = {
        status,
        data: { error: 'upstream' },
        headers: {},
        statusText: String(status),
        config: {} as InternalAxiosRequestConfig
    };
    return err;
}

function okResponse(): AxiosResponse {
    return {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        config: {} as InternalAxiosRequestConfig,
        data: Readable.from([Buffer.from('{"ok":true}')])
    };
}

function testConnection() {
    return shared.seeders.getTestConnection({
        connection_id: 'connection-id',
        provider_config_key: '0codekit',
        environment_id: 2,
        credentials: { type: 'API_KEY', apiKey: 'placeholder-api-key' }
    });
}

function integrationFixture(): Config {
    return {
        id: 10,
        unique_key: '0codekit',
        provider: '0codekit',
        custom: null,
        oauth_client_id: null,
        oauth_client_secret: null
    } as unknown as Config;
}

function authorizedPrincipal(): ApiKeyPrincipal {
    return {
        type: 'api_key',
        source: 'customer_key',
        accountId: 1,
        scopes: [...principalScopes],
        environmentIds: [...principalEnvironmentIds],
        keyId: 123
    };
}

async function listen(app: Express): Promise<{ url: string; close: () => Promise<void> }> {
    return await new Promise((resolve) => {
        const httpServer = app.listen(0, '127.0.0.1', () => {
            const address = httpServer.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () =>
                    new Promise((done) => {
                        httpServer.close(() => done());
                    })
            });
        });
    });
}

async function readBody(res: globalThis.Response): Promise<unknown> {
    const text = await res.text();
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

function proxyHeaders(retries?: string): Record<string, string> {
    const headers: Record<string, string> = {
        'provider-config-key': '0codekit',
        'connection-id': 'connection-id',
        'base-url-override': ATTACKER_ORIGIN
    };
    if (retries !== undefined) {
        headers['retries'] = retries;
    }
    return headers;
}

async function callProxy(method: string, retries?: string): Promise<{ status: number; body: unknown }> {
    const res = await fetch(`${url}/proxy/items`, {
        method,
        headers: proxyHeaders(retries)
    });
    return { status: res.status, body: await readBody(res) };
}

function expectNoProxyWork(): void {
    expect(httpCall).not.toHaveBeenCalled();
    expect(shared.configService.getProviderConfig).not.toHaveBeenCalled();
    expect(shared.connectionService.getConnection).not.toHaveBeenCalled();
    expect(logContextGetter.create).not.toHaveBeenCalled();
    expect(metrics.increment).not.toHaveBeenCalled();
}

function expectInvalidRetries(status: number, body: unknown): void {
    expectNoProxyWork();
    expect(status).toBe(400);
    expect(body).toMatchObject({
        error: {
            code: 'invalid_headers',
            errors: expect.arrayContaining([expect.objectContaining({ path: ['retries'] })])
        }
    });
}

describe('public HTTP proxy retries', () => {
    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        app.use((_req: Request, res: Response, next: NextFunction) => {
            res.locals['authType'] = 'secretKey';
            res.locals['account'] = { id: 1, uuid: 'account-uuid' } as DBTeam;
            res.locals['plan'] = null;
            res.locals['environment'] = { id: 2, name: 'dev', account_id: 1, is_production: false } as DBEnvironment;
            res.locals['apiKeyPrincipal'] = authorizedPrincipal();
            next();
        });
        app.all('/proxy{/*splat}', rateLimiterMiddleware, can('environment:proxy'), allPublicProxy);
        app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
            const message = err instanceof Error ? err.message : 'error';
            res.status(500).json({ error: { code: 'server_error', message } });
        });
        ({ url, close } = await listen(app));
    });

    afterAll(async () => {
        await close();
    });

    beforeEach(() => {
        principalScopes = ['environment:*'];
        principalEnvironmentIds = [2];
        logMessages = [];

        const logCtx = {
            id: 'proxy-log-id',
            enrichOperation: vi.fn(),
            error: vi.fn(),
            failed: vi.fn(),
            success: vi.fn(),
            log: vi.fn((message: { message?: string }) => {
                if (typeof message.message === 'string') {
                    logMessages.push(message.message);
                }
            })
        } as unknown as LogContext;
        vi.spyOn(logContextGetter, 'create').mockResolvedValue(logCtx as unknown as LogContextOrigin);
        vi.spyOn(capping, 'getStatus').mockResolvedValue({ isCapped: false } as Awaited<ReturnType<typeof capping.getStatus>>);
        vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        vi.spyOn(shared.pubsub.publisher, 'publish').mockResolvedValue(Ok(undefined));
        vi.spyOn(shared.configService, 'getProviderConfig').mockResolvedValue(integrationFixture());
        vi.spyOn(shared.connectionService, 'getConnection').mockResolvedValue({
            success: true,
            error: null,
            response: testConnection()
        });
        vi.spyOn(shared, 'refreshOrTestCredentials').mockResolvedValue(Ok(testConnection()));
        httpCall = vi.spyOn(shared.ProxyRequest.prototype, 'httpCall').mockRejectedValue(makeAxiosError(400));
        consume = vi.spyOn(RateLimiterMemory.prototype, 'consume');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each(['6', '1000000', '1e6', '6.0'])('rejects retries header %s before any outbound call', async (retries) => {
        const result = await callProxy('GET', retries);

        expectInvalidRetries(result.status, result.body);
    });

    it.each(['Infinity', '1e309', '-1', '5.5', 'NaN'])('rejects non-finite or non-integer retries header %s before any outbound call', async (retries) => {
        const result = await callProxy('GET', retries);

        expectInvalidRetries(result.status, result.body);
    });

    it.each(METHODS)('rejects retries above five for %s', async (method) => {
        const result = await callProxy(method, '1000000');

        expectInvalidRetries(result.status, result.body);
    });

    it('lets a default environment wildcard key proxy the connection in that environment', async () => {
        httpCall.mockResolvedValue(okResponse());

        const result = await callProxy('GET');

        expect(result.status).toBe(200);
        expect(httpCall).toHaveBeenCalledOnce();
        const config = httpCall.mock.calls[0]?.[0] as AxiosRequestConfig;
        expect(config.url).toBe(`${ATTACKER_ORIGIN}/items`);
        expect((config.signal as AbortSignal | undefined)?.aborted).not.toBe(true);
        expect(shared.configService.getProviderConfig).toHaveBeenCalledWith('0codekit', 2);
        expect(shared.connectionService.getConnection).toHaveBeenCalledWith('connection-id', '0codekit', 2);
        expect(consume).toHaveBeenCalledWith('account-secret-1', 1);
    });

    it('refuses a key whose scopes do not include environment:proxy', async () => {
        principalScopes = ['environment:logs:read'];

        const result = await callProxy('GET', '1000000');

        expect(result.status).toBe(403);
        expect(result.body).toMatchObject({ error: { code: 'forbidden' } });
        expectNoProxyWork();
    });

    it('refuses a wildcard key that is not authorized for this environment', async () => {
        principalEnvironmentIds = [99];

        const result = await callProxy('GET', '0');

        expect(result.status).toBe(403);
        expect(result.body).toMatchObject({ error: { code: 'forbidden' } });
        expectNoProxyWork();
    });

    it('accepts five retries and passes that count into the retry loop', async () => {
        const result = await callProxy('GET', String(PROXY_RETRY_CAP));

        expect(result.status).toBe(400);
        expect(httpCall).toHaveBeenCalledOnce();
        expect(logMessages).toContain('Skipping retry HTTP call (reason: not_retryable) [1/5]');
        expect(consume).toHaveBeenCalledTimes(1);
    });

    it('retries HTTP 500 by default, once per allowed retry, after a single rate-limit charge', async () => {
        httpCall.mockRejectedValue(makeAxiosError(500));

        const pending = callProxy('GET', '1');
        await expect.poll(() => httpCall.mock.calls.length, { timeout: 6_000, interval: 50 }).toBe(2);
        const result = await pending;

        expect(result.status).toBe(500);
        expect(consume).toHaveBeenCalledTimes(1);
        expect(consume).toHaveBeenCalledWith('account-secret-1', 1);
        expect(logMessages.some((message) => message.includes('status_code_500') && message.includes('[1/1]'))).toBe(true);
        expect(getExponentialBackoff(0, 10 * 60 * 1000)).toBe(RETRY_BACKOFF_MS);
        expect(getExponentialBackoff(8, 10 * 60 * 1000)).toBe(10 * 60 * 1000);
    }, 15_000);

    it('does not retry when the header is omitted', async () => {
        httpCall.mockRejectedValue(makeAxiosError(500));

        const started = Date.now();
        const result = await callProxy('GET');

        expect(result.status).toBe(500);
        expect(httpCall).toHaveBeenCalledOnce();
        expect(Date.now() - started).toBeLessThan(RETRY_BACKOFF_MS);
    });

    it('stops later attempts when the client disconnects', async () => {
        const controller = new AbortController();
        let seenSignal: AbortSignal | undefined;
        httpCall.mockImplementation((config) => {
            if (httpCall.mock.calls.length === 1) {
                seenSignal = config?.signal as AbortSignal | undefined;
                controller.abort();
            }
            return Promise.reject(makeAxiosError(500));
        });

        await fetch(`${url}/proxy/items`, { method: 'GET', headers: proxyHeaders('1'), signal: controller.signal }).catch((err: unknown) => {
            expect(err).toBeInstanceOf(Error);
        });

        // The first retry waits three seconds unless the closed client aborts it.
        await sleep(RETRY_BACKOFF_MS + 1_500);

        expect(httpCall).toHaveBeenCalledOnce();
        expect(seenSignal).toBeInstanceOf(AbortSignal);
        expect(seenSignal?.aborted).toBe(true);
    }, 15_000);
});
