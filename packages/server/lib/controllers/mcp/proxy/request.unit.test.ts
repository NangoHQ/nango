import { Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import proxyService, { ProxyServiceError } from '../../../services/proxy.service.js';
import { egressTelemetryRecorder } from '../../../utils/egressTelemetry.js';
import { PublicMcpError } from '../utils.js';
import { proxyRequestTool } from './request.js';
import { MAX_MCP_PROXY_RESPONSE_BYTES } from './response.js';

import type { ProxyServiceResponse } from '../../../services/proxy.service.js';
import type { ManagementMcpContext } from '../managementTool.js';

const context = {
    account: { id: 1, uuid: 'account-uuid' },
    environment: { id: 42, uuid: 'e0000000-0000-4000-8000-000000000042', name: 'dev' },
    plan: null,
    grantedScopes: ['environment:proxy']
} as ManagementMcpContext;
const recordEgressedBytes = vi.fn();

describe('proxyRequestTool', () => {
    beforeEach(() => {
        recordEgressedBytes.mockClear();
        vi.spyOn(egressTelemetryRecorder, 'record').mockImplementation(recordEgressedBytes);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('maps all request options to the service and independently formats its response', async () => {
        const complete = vi.fn().mockResolvedValue(undefined);
        const requestSpy = vi.spyOn(proxyService, 'request').mockResolvedValue({
            result: Ok({
                outcome: 'success',
                status: 201,
                headers: { 'content-type': 'application/json', 'x-request-id': 'request-id', 'x-values': ['one', 'two'], ignored: undefined },
                body: Readable.from(['{"created":true}']),
                complete
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
        expect(complete).toHaveBeenCalledOnce();
        expect(recordEgressedBytes).toHaveBeenCalledWith({
            accountId: 1,
            environmentId: 42,
            environmentName: 'dev',
            integrationId: 'github',
            connectionId: 'connection-id',
            callsite: 'proxy',
            egressedBytes: Buffer.byteLength('{"created":true}'),
            count: 1
        });
    });

    it('returns normal JSON while preserving unsafe and high-precision numbers as strings', async () => {
        mockProxyResponse(
            '{"count":42,"safe":9007199254740991,"unsafe":7584781588001541408,"exponent":1e20,"decimal":0.1234567890123456}',
            'Application/Problem+JSON; Charset=UTF-8'
        );

        const result = await requestThroughTool();

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({
                status: 200,
                headers: { 'content-type': 'Application/Problem+JSON; Charset=UTF-8' },
                body: {
                    count: 42,
                    safe: 9007199254740991,
                    unsafe: '7584781588001541408',
                    exponent: '100000000000000000000',
                    decimal: '0.1234567890123456'
                }
            });
        }
    });

    it.each(['application/x-amz-json-1.0', 'application/x-amz-json-1.1'])('accepts and formats the AWS JSON media type %s', async (contentType) => {
        mockProxyResponse('{"TableNames":["users"]}', contentType);

        const result = await requestThroughTool();

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.body).toStrictEqual({ TableNames: ['users'] });
        }
    });

    it.each([
        ['Olá 👋', 'text/plain; charset=utf-8'],
        ['no content type', undefined]
    ])('accepts the UTF-8 text response %j with content type %j', async (body, contentType) => {
        mockProxyResponse(body, contentType);

        const result = await requestThroughTool();

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.body).toBe(body);
        }
        expect(recordEgressedBytes).toHaveBeenCalledWith(expect.objectContaining({ egressedBytes: Buffer.byteLength(body) }));
    });

    it('preserves constructor properties in structured JSON responses', async () => {
        mockProxyResponse('{"constructor":{"name":"provider-value"}}', 'application/json');

        const result = await requestThroughTool();

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toMatchObject({ body: { constructor: { name: 'provider-value' } } });
        }
    });

    it.each([
        [null, 'null'],
        [false, 'false'],
        [0, '0'],
        ['', '""']
    ])('serializes the JSON primitive %j before passing it to the proxy service', async (body, serializedBody) => {
        const complete = vi.fn().mockResolvedValue(undefined);
        const requestSpy = vi.spyOn(proxyService, 'request').mockResolvedValue({
            result: Ok({
                outcome: 'success',
                status: 204,
                headers: {},
                body: Readable.from([]),
                complete
            })
        });

        const result = await proxyRequestTool.handler(
            { method: 'POST', path: '/items', integration_id: 'github', connection_id: 'connection-id', body },
            context
        );

        expect(requestSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                headers: { 'content-type': 'application/json' },
                body: serializedBody
            })
        );
        expect(result.isOk()).toBe(true);
        expect(complete).toHaveBeenCalledOnce();
    });

    it('preserves an explicitly supplied content type', async () => {
        const complete = vi.fn().mockResolvedValue(undefined);
        const requestSpy = vi.spyOn(proxyService, 'request').mockResolvedValue({
            result: Ok({
                outcome: 'success',
                status: 204,
                headers: {},
                body: Readable.from([]),
                complete
            })
        });

        const result = await proxyRequestTool.handler(
            {
                method: 'POST',
                path: '/items',
                integration_id: 'github',
                connection_id: 'connection-id',
                headers: { 'Content-Type': 'application/problem+json' },
                body: null
            },
            context
        );

        expect(requestSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                headers: { 'Content-Type': 'application/problem+json' },
                body: 'null'
            })
        );
        expect(result.isOk()).toBe(true);
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

    it('rejects more than five retries before calling the service', async () => {
        const requestSpy = vi.spyOn(proxyService, 'request');

        const result = await proxyRequestTool.handler(
            { method: 'GET', path: '/items', integration_id: 'github', connection_id: 'connection-id', retries: 6 },
            context
        );

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('retries:');
        }
        expect(requestSpy).not.toHaveBeenCalled();
    });

    it('rejects URL fragments before calling the service', async () => {
        const requestSpy = vi.spyOn(proxyService, 'request');

        const result = await proxyRequestTool.handler(
            { method: 'GET', path: '/items#fragment', integration_id: 'github', connection_id: 'connection-id' },
            context
        );

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('URL fragments are not supported');
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
        const { complete, responseBody } = mockProxyResponse(Buffer.from([0xff, 0x00, 0xfe]), 'application/pdf');
        const destroySpy = vi.spyOn(responseBody, 'destroy');

        const result = await requestThroughTool('/report.pdf');

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Use the HTTP proxy for binary responses');
        }
        expect(destroySpy).toHaveBeenCalledOnce();
        expect(complete).toHaveBeenCalledWith(expect.any(Error));
        expect(recordEgressedBytes).not.toHaveBeenCalled();
    });

    it.each([
        [Buffer.from([0xff]), 'text/plain'],
        ['olá', 'text/plain; charset=iso-8859-1']
    ])('rejects the non-UTF-8 response %#', async (body, contentType) => {
        const { complete } = mockProxyResponse(body, contentType);

        const result = await requestThroughTool();

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
        }
        expect(complete).toHaveBeenCalledWith(expect.any(Error));
        expect(recordEgressedBytes).not.toHaveBeenCalled();
    });

    it('returns unsupported response chunks as public MCP errors', async () => {
        const { complete } = mockProxyResponse({ unsupported: true }, 'text/plain');

        const result = await requestThroughTool();

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('unsupported response body');
        }
        expect(complete).toHaveBeenCalledWith(expect.any(Error));
        expect(recordEgressedBytes).not.toHaveBeenCalled();
    });

    it('removes a stale content length after the provider response was decompressed', async () => {
        mockProxyResponse('decompressed response', 'text/plain', {
            headers: { 'content-length': '10', 'x-request-id': 'request-id' },
            wasCompressed: true
        });

        const result = await requestThroughTool();

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.headers).toStrictEqual({ 'content-type': 'text/plain', 'x-request-id': 'request-id' });
        }
    });

    it('does not fail a successful provider response when completion fails', async () => {
        const { complete } = mockProxyResponse('success', 'text/plain');
        complete.mockRejectedValueOnce(new Error('Failed to update the activity log'));

        const result = await requestThroughTool();

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.body).toBe('success');
        }
        expect(complete).toHaveBeenCalledOnce();
    });

    it('accepts a response at the Management MCP byte limit', async () => {
        const body = Buffer.alloc(MAX_MCP_PROXY_RESPONSE_BYTES, 0x61);
        mockProxyResponse(body, 'text/plain');

        const result = await requestThroughTool();

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(Buffer.byteLength(result.value.body as string)).toBe(MAX_MCP_PROXY_RESPONSE_BYTES);
        }
        expect(recordEgressedBytes).toHaveBeenCalledWith(expect.objectContaining({ egressedBytes: MAX_MCP_PROXY_RESPONSE_BYTES }));
    });

    it('aborts a response over the Management MCP byte limit', async () => {
        const { complete, responseBody } = mockProxyResponse(Buffer.alloc(MAX_MCP_PROXY_RESPONSE_BYTES + 1, 0x61), 'text/plain');
        const destroySpy = vi.spyOn(responseBody, 'destroy');

        const result = await requestThroughTool();

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Use the HTTP proxy for large responses');
        }
        expect(destroySpy).toHaveBeenCalledOnce();
        expect(complete).toHaveBeenCalledWith(expect.any(Error));
        expect(recordEgressedBytes).not.toHaveBeenCalled();
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

function mockProxyResponse(
    body: unknown,
    contentType?: string,
    { headers = {}, wasCompressed }: { headers?: Record<string, unknown>; wasCompressed?: boolean } = {}
): { complete: ReturnType<typeof vi.fn>; responseBody: Readable } {
    const complete = vi.fn().mockResolvedValue(undefined);
    const responseBody = Readable.from([body]);
    const response: ProxyServiceResponse = {
        outcome: 'success',
        status: 200,
        headers: { ...(contentType ? { 'content-type': contentType } : {}), ...headers },
        body: responseBody,
        complete,
        ...(wasCompressed !== undefined ? { wasCompressed } : {})
    };
    vi.spyOn(proxyService, 'request').mockResolvedValue({ result: Ok(response) });
    return { complete, responseBody };
}

async function requestThroughTool(path = '/items') {
    return await proxyRequestTool.handler({ method: 'GET', path, integration_id: 'github', connection_id: 'connection-id' }, context);
}
