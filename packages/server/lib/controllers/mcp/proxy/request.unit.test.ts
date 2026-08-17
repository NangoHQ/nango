import { Readable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import proxyService, { ProxyServiceError } from '../../../services/proxy.service.js';
import { PublicMcpError } from '../utils.js';
import { proxyRequestTool } from './request.js';

import type { ManagementMcpContext } from '../managementTool.js';

const context = {
    account: { id: 1, uuid: 'account-uuid' },
    environment: { id: 42, name: 'dev' },
    plan: null,
    grantedScopes: ['environment:proxy']
} as ManagementMcpContext;

describe('proxyRequestTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('maps all request options to the service and independently formats its response', async () => {
        const requestSpy = vi.spyOn(proxyService, 'request').mockResolvedValue({
            result: Ok({
                outcome: 'success',
                status: 201,
                headers: { 'content-type': 'application/json', 'x-request-id': 'request-id', 'x-values': ['one', 'two'], ignored: undefined },
                body: Readable.from(['{"created":true}'])
            })
        });

        const result = await proxyRequestTool.handler(
            {
                method: 'POST',
                path: '/items',
                integration_id: 'github',
                connection_id: 'connection-id',
                query_params: { limit: 10, tag: ['one', 'two'] },
                headers: { 'content-type': 'application/json' },
                body: { name: 'test' },
                base_url_override: 'https://api.example.com',
                retries: 2,
                decompress: true,
                retry_on: [429, 503],
                forward_headers_on_redirect: false
            },
            context
        );

        expect(requestSpy).toHaveBeenCalledWith({
            account: context.account,
            environment: context.environment,
            plan: null,
            method: 'POST',
            endpoint: '/items?limit=10&tag=one&tag=two',
            integrationId: 'github',
            connectionId: 'connection-id',
            headers: { 'content-type': 'application/json' },
            body: { name: 'test' },
            retries: 2,
            baseUrlOverride: 'https://api.example.com',
            decompress: true,
            retryOn: [429, 503],
            forwardHeadersOnRedirect: false
        });
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({
                status: 201,
                headers: { 'content-type': 'application/json', 'x-request-id': 'request-id', 'x-values': ['one', 'two'] },
                body: { created: true }
            });
        }
    });

    it('rejects invalid arguments before calling the service', async () => {
        const requestSpy = vi.spyOn(proxyService, 'request');

        const result = await proxyRequestTool.handler(
            { method: 'TRACE', path: 'items', integration_id: 'github', connection_id: 'connection-id', unexpected: true },
            context
        );

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid proxy_request arguments:');
        }
        expect(requestSpy).not.toHaveBeenCalled();
    });

    it('maps safe service failures to public MCP errors', async () => {
        vi.spyOn(proxyService, 'request').mockResolvedValue({
            result: Err(new ProxyServiceError({ code: 'unknown_integration', message: 'Integration does not exist', status: 404 }))
        });

        const result = await proxyRequestTool.handler({ method: 'GET', path: '/items', integration_id: 'missing', connection_id: 'connection-id' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe('Integration does not exist');
        }
    });

    it('returns unsupported provider response formats as public MCP errors', async () => {
        vi.spyOn(proxyService, 'request').mockResolvedValue({
            result: Ok({
                outcome: 'success',
                status: 200,
                headers: { 'content-type': 'application/pdf' },
                body: Readable.from([Buffer.from([0xff, 0x00, 0xfe])])
            })
        });

        const result = await proxyRequestTool.handler(
            { method: 'GET', path: '/report.pdf', integration_id: 'github', connection_id: 'connection-id' },
            context
        );

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Use the HTTP proxy for binary responses');
        }
    });

    it('keeps unexpected service failures private', async () => {
        const serviceError = new ProxyServiceError({ code: 'internal_error', message: 'sensitive failure', status: 500 });
        vi.spyOn(proxyService, 'request').mockResolvedValue({ result: Err(serviceError) });

        const result = await proxyRequestTool.handler({ method: 'GET', path: '/items', integration_id: 'github', connection_id: 'connection-id' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBe(serviceError);
            expect(result.error).not.toBeInstanceOf(PublicMcpError);
        }
    });
});
