import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AxiosError } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_OUTBOUND_URL_POLICY, OutboundUrlError } from '@nangohq/egress';

import { getTestConnection } from '../../seeders/connection.seeder.js';
import { ProxyRequest } from './request.js';
import { getDefaultProxy } from './utils.test.js';

import type { InternalAxiosRequestConfig } from 'axios';

const productionProxyRequestFiles = [
    'packages/server/lib/hooks/connection/internal-nango.ts',
    'packages/server/lib/hooks/connection/credentials-verification-script.ts',
    'packages/server/lib/hooks/hooks.ts',
    'packages/server/lib/controllers/auth/postAwsSigV4.ts',
    'packages/server/lib/services/proxy.service.ts',
    'packages/shared/lib/services/notification/slack.service.ts',
    'packages/runner/lib/sdk/sdk.ts'
];

function extractProxyRequestConstructorArgs(source: string): string[] {
    const results: string[] = [];
    const needle = 'new ProxyRequest(';
    let searchFrom = 0;
    while (true) {
        const start = source.indexOf(needle, searchFrom);
        if (start === -1) {
            break;
        }
        const openParen = start + needle.length - 1;
        let depth = 0;
        let end = openParen;
        for (; end < source.length; end++) {
            const char = source[end];
            if (char === '(') {
                depth++;
            } else if (char === ')') {
                depth--;
                if (depth === 0) {
                    break;
                }
            }
        }
        results.push(source.slice(openParen, end + 1));
        searchFrom = end + 1;
    }
    return results;
}

function makeAxiosError(status: number): AxiosError {
    const err = new AxiosError(`Request failed with status code ${status}`);
    err.response = {
        status,
        data: {},
        headers: {},
        statusText: String(status),
        config: {} as InternalAxiosRequestConfig
    };
    return err;
}

describe('call', () => {
    it('should make a single successful http call', async () => {
        const fn = vi.fn();
        const proxy = new ProxyRequest({
            logger: fn,
            proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: 'https://httpstatuses.maor.io' } }, endpoint: '/200' }),
            outboundPolicy: DEFAULT_OUTBOUND_URL_POLICY,
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null })
        });
        vi.spyOn(proxy, 'httpCall').mockResolvedValue({
            status: 200,
            data: {},
            headers: {},
            config: {} as InternalAxiosRequestConfig,
            statusText: 'OK'
        });
        const res = (await proxy.request()).unwrap();
        expect(res).toMatchObject({ status: 200 });
        expect(fn).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                level: 'info',
                type: 'http',
                message: 'GET https://httpstatuses.maor.io/200',
                request: { headers: {}, method: 'GET', url: 'https://httpstatuses.maor.io/200' },
                response: expect.objectContaining({ code: 200 })
            })
        );
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should make a single failed http call', async () => {
        const fn = vi.fn();
        const proxy = new ProxyRequest({
            logger: fn,
            proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: 'https://httpstatuses.maor.io' } }, endpoint: '/400', retries: 1 }),
            outboundPolicy: DEFAULT_OUTBOUND_URL_POLICY,
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null })
        });
        vi.spyOn(proxy, 'httpCall').mockRejectedValue(makeAxiosError(400));
        await expect(async () => (await proxy.request()).unwrap()).rejects.toThrowError();
        expect(fn).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                level: 'error',
                type: 'http',
                message: 'GET https://httpstatuses.maor.io/400',
                request: { headers: {}, method: 'GET', url: 'https://httpstatuses.maor.io/400' },
                response: expect.objectContaining({ code: 400 }),
                retry: { max: 1, attempt: 0, waited: 0 }
            })
        );
        expect(fn).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                level: 'warn',
                message: 'Skipping retry HTTP call (reason: not_retryable) [1/1]'
            })
        );
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retries failed http call', { timeout: 10000 }, async () => {
        const fn = vi.fn();
        const getConnection = vi.fn(() => {
            return getTestConnection();
        });
        const proxy = new ProxyRequest({
            logger: fn,
            proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: 'https://httpstatuses.maor.io' } }, endpoint: '/500', retries: 1 }),
            outboundPolicy: DEFAULT_OUTBOUND_URL_POLICY,
            getConnection,
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null })
        });
        vi.spyOn(proxy, 'httpCall').mockRejectedValue(makeAxiosError(500));
        await expect(async () => (await proxy.request()).unwrap()).rejects.toThrowError();
        expect(fn).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                level: 'error',
                type: 'http',
                message: 'GET https://httpstatuses.maor.io/500',
                request: { headers: {}, method: 'GET', url: 'https://httpstatuses.maor.io/500' },
                response: expect.objectContaining({ code: 500 }),
                retry: { max: 1, attempt: 0, waited: 0 }
            })
        );
        expect(fn).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                level: 'warn',
                message: 'Retrying HTTP call (reason: status_code_500). Waiting for 3000ms [1/1]'
            })
        );
        expect(fn).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                level: 'error',
                type: 'http',
                message: 'GET https://httpstatuses.maor.io/500',
                request: { headers: {}, method: 'GET', url: 'https://httpstatuses.maor.io/500' },
                response: expect.objectContaining({ code: 500 }),
                retry: { max: 1, attempt: 1, waited: 3000 }
            })
        );
        expect(fn).toHaveBeenCalledTimes(3);

        // should dynamically rebuild proxy config on each iteration
        expect(getConnection).toHaveBeenCalledTimes(2);
    });

    it('blocks private IP-literal targets when outboundPolicy is set', async () => {
        const proxy = new ProxyRequest({
            logger: vi.fn(),
            proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: 'http://127.0.0.1' } }, endpoint: '/' }),
            outboundPolicy: DEFAULT_OUTBOUND_URL_POLICY,
            getConnection: () => getTestConnection(),
            getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null })
        });
        const result = await proxy.request();
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(OutboundUrlError);
        }
    });

    it('every production ProxyRequest construction supplies outboundPolicy', () => {
        let constructionCount = 0;
        for (const relativePath of productionProxyRequestFiles) {
            const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
            const argsList = extractProxyRequestConstructorArgs(source);
            expect(argsList.length, `${relativePath} should construct ProxyRequest`).toBeGreaterThan(0);
            for (const [index, args] of argsList.entries()) {
                expect(args, `${relativePath} construction #${index + 1} missing outboundPolicy`).toMatch(/outboundPolicy\s*:/);
                constructionCount += 1;
            }
        }
        expect(constructionCount).toBeGreaterThanOrEqual(8);
    });
});
