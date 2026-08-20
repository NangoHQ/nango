import { PassThrough, Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { getLogger } from '@nangohq/utils';

import { ProxyServiceError } from '../../services/proxy.service.js';
import { handleErrorResponse, handleProxyServiceErrorResponse, handleResponse, parseHeaders, shouldForwardResponseHeader } from './allProxy.js';

import type { ProxyServiceResponse } from '../../services/proxy.service.js';
import type { LogContext } from '@nangohq/logs';
import type { Request, Response } from 'express';

describe('parseHeaders', () => {
    it('should parse headers that starts with Nango-Proxy or nango-proxy', () => {
        const req: Pick<Request, 'rawHeaders'> = {
            rawHeaders: ['Nango-Proxy-Test-Header', 'TestValue', 'nango-proxy-another-header', 'AnotherValue', 'Irrelevant-Header', 'IrrelevantValue']
        };

        const parsedHeaders = parseHeaders(req);

        expect(parsedHeaders).toEqual({
            'Test-Header': 'TestValue',
            'another-header': 'AnotherValue'
        });
    });

    it('should return an empty object when there are no Nango-Proxy or nango-proxy headers', () => {
        const req: Pick<Request, 'rawHeaders'> = {
            rawHeaders: ['Irrelevant-Header-One', 'IrrelevantValueOne', 'Irrelevant-Header-Two', 'IrrelevantValueTwo']
        };

        const parsedHeaders = parseHeaders(req);

        expect(parsedHeaders).toEqual({});
    });

    it('should handle the case when rawHeaders is not an array or empty', () => {
        const req = {};

        const parsedHeaders = parseHeaders(req as Pick<Request, 'rawHeaders'>);

        expect(parsedHeaders).toEqual({});
    });
});

describe('shouldForwardResponseHeader', () => {
    it('forwards normal headers and rejects empty or denied ones', () => {
        expect(shouldForwardResponseHeader('x-request-id', 'abc')).toBe(true);
        expect(shouldForwardResponseHeader('x-request-id', '')).toBe(false);
        expect(shouldForwardResponseHeader('x-request-id', undefined)).toBe(false);
        expect(shouldForwardResponseHeader('connection', 'keep-alive')).toBe(false);
        expect(shouldForwardResponseHeader('access-control-allow-origin', '*')).toBe(false);
        expect(shouldForwardResponseHeader('content-length', '10')).toBe(false);
        expect(shouldForwardResponseHeader('content-length', '10', { allowContentLength: true })).toBe(true);
    });
});

/* eslint-disable @typescript-eslint/unbound-method */
describe('handleResponse', () => {
    const mockLogCtx = {
        success: vi.fn(),
        failed: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        accountId: 1
    } as unknown as LogContext;

    const createMockResponse = () => {
        let sentData: Buffer | undefined;
        const headers: Record<string, string> = {};
        let statusCode = 200;
        let sendResolve: (() => void) | undefined;
        const sendPromise = new Promise<void>((resolve) => {
            sendResolve = resolve;
        });

        const res = {
            headersSent: false,
            setHeader: vi.fn((name: string, value: string) => {
                headers[name] = value;
            }),
            send: vi.fn((data?: Buffer) => {
                sentData = data;
                if (sendResolve) sendResolve();
            }),
            status: vi.fn((code: number) => {
                statusCode = code;
                return res;
            }),
            writeHead: vi.fn(() => {
                res.headersSent = true;
                return res;
            }),
            end: vi.fn(() => {
                if (sendResolve) sendResolve();
            }),
            destroy: vi.fn(() => {
                if (sendResolve) sendResolve();
            }),
            on: vi.fn().mockReturnThis(),
            once: vi.fn().mockReturnThis(),
            emit: vi.fn().mockReturnThis(),
            write: vi.fn()
        };

        return {
            res: res as unknown as Response,
            getSentData: () => sentData,
            getHeaders: () => headers,
            getStatusCode: () => statusCode,
            waitForSend: () => sendPromise
        };
    };

    const createMockResponseStream = (
        data: string,
        {
            contentType = 'application/json',
            status = 200,
            headers = {},
            wasCompressed
        }: { contentType?: string; status?: number; headers?: Record<string, string>; wasCompressed?: boolean } = {}
    ): ProxyServiceResponse => {
        const stream = new Readable();
        stream.push(data);
        stream.push(null);

        return {
            outcome: 'success',
            status,
            headers: { 'content-type': contentType, ...headers },
            body: stream,
            complete: vi.fn().mockResolvedValue(undefined),
            ...(wasCompressed !== undefined ? { wasCompressed } : {})
        };
    };

    it('should handle 204 No Content response', async () => {
        const mockRes = createMockResponse();
        const mockResponseStream = createMockResponseStream('', { status: 204 });
        const onEgressedBytes = vi.fn();

        handleResponse({ res: mockRes.res, responseStream: mockResponseStream, logCtx: mockLogCtx, onEgressedBytes });
        await mockRes.waitForSend();

        expect(mockRes.res.status).toHaveBeenCalledWith(204);
        expect(mockResponseStream.complete).toHaveBeenCalledOnce();
        expect(onEgressedBytes).toHaveBeenCalledWith(0);
    });

    it('should validate that response is valid JSON', async () => {
        const validJson = '{"id": 123, "name": "test"}';
        const mockRes = createMockResponse();
        const mockResponseStream = createMockResponseStream(validJson);
        const onEgressedBytes = vi.fn();

        handleResponse({ res: mockRes.res, responseStream: mockResponseStream, logCtx: mockLogCtx, onEgressedBytes });
        await mockRes.waitForSend();

        expect(mockRes.getSentData()!.toString()).toBe(validJson);
        expect(mockLogCtx.error).not.toHaveBeenCalled();
        expect(mockResponseStream.complete).toHaveBeenCalledOnce();
        expect(onEgressedBytes).toHaveBeenCalledWith(Buffer.byteLength(validJson));
    });

    it('should preserve BigInt values in JSON response without precision loss', async () => {
        const jsonWithBigInt = `{"id": 7584781588001541408, "name": "test", "count": 42, "list": [12345678901234567890, 98765432109876543210]}`;

        const mockRes = createMockResponse();
        const mockResponseStream = createMockResponseStream(jsonWithBigInt);

        handleResponse({ res: mockRes.res, responseStream: mockResponseStream, logCtx: mockLogCtx });
        await mockRes.waitForSend();

        const sentData = mockRes.getSentData();
        expect(sentData).toBeDefined();
        expect(sentData!.toString()).toBe(jsonWithBigInt);
    });

    it('should pass-thru non-json payload', async () => {
        const nonJsonPayload = `<foobar>`;
        const mockRes = createMockResponse();
        const mockResponseStream = createMockResponseStream(nonJsonPayload, { contentType: 'text/xml' });

        handleResponse({ res: mockRes.res, responseStream: mockResponseStream, logCtx: mockLogCtx });
        await mockRes.waitForSend();

        const sentData = mockRes.getSentData();
        expect(sentData).toBeDefined();
        expect(sentData!.toString()).toBe(nonJsonPayload);
    });

    it('should forward provider response headers on the buffered path when the flag is on', async () => {
        const mockRes = createMockResponse();
        const mockResponseStream = createMockResponseStream('{"ok":true}', {
            contentType: 'application/json',
            status: 200,
            headers: {
                'mcp-session-id': 'session-abc123',
                'x-request-id': 'req-xyz',
                'x-ratelimit-limit': '100',
                'x-ratelimit-remaining': '42',
                link: '<https://api.example.com/page/2>; rel="next"'
            }
        });

        handleResponse({ res: mockRes.res, responseStream: mockResponseStream, logCtx: mockLogCtx, forwardAllResponseHeaders: true });
        await mockRes.waitForSend();

        expect(mockRes.res.setHeader).toHaveBeenCalledWith('content-type', 'application/json');
        expect(mockRes.res.setHeader).toHaveBeenCalledWith('mcp-session-id', 'session-abc123');
        expect(mockRes.res.setHeader).toHaveBeenCalledWith('x-request-id', 'req-xyz');
        expect(mockRes.res.setHeader).toHaveBeenCalledWith('x-ratelimit-limit', '100');
        expect(mockRes.res.setHeader).toHaveBeenCalledWith('x-ratelimit-remaining', '42');
        expect(mockRes.res.setHeader).toHaveBeenCalledWith('link', '<https://api.example.com/page/2>; rel="next"');
    });

    it('should only forward allowlisted headers on the buffered path when the flag is off', async () => {
        const mockRes = createMockResponse();
        const mockResponseStream = createMockResponseStream('{"ok":true}', {
            contentType: 'application/json',
            status: 200,
            headers: {
                'mcp-session-id': 'session-abc123',
                'x-request-id': 'req-xyz',
                'x-ratelimit-limit': '100',
                link: '<https://api.example.com/page/2>; rel="next"'
            }
        });

        handleResponse({ res: mockRes.res, responseStream: mockResponseStream, logCtx: mockLogCtx, forwardAllResponseHeaders: false });
        await mockRes.waitForSend();

        expect(mockRes.res.setHeader).toHaveBeenCalledWith('content-type', 'application/json');
        expect(mockRes.res.setHeader).toHaveBeenCalledWith('mcp-session-id', 'session-abc123');
        expect(mockRes.res.setHeader).toHaveBeenCalledWith('x-request-id', 'req-xyz');
        expect(mockRes.res.setHeader).not.toHaveBeenCalledWith('x-ratelimit-limit', expect.anything());
        expect(mockRes.res.setHeader).not.toHaveBeenCalledWith('link', expect.anything());
    });

    it('should not forward hop-by-hop, content-length and CORS headers on the buffered path', async () => {
        const mockRes = createMockResponse();
        const mockResponseStream = createMockResponseStream('{"ok":true}', {
            contentType: 'application/json',
            status: 200,
            headers: {
                connection: 'keep-alive',
                'keep-alive': 'timeout=5',
                'content-length': '500',
                'access-control-allow-origin': 'https://provider.example.com',
                'x-request-id': 'req-xyz'
            }
        });

        handleResponse({ res: mockRes.res, responseStream: mockResponseStream, logCtx: mockLogCtx, forwardAllResponseHeaders: true });
        await mockRes.waitForSend();

        expect(mockRes.res.setHeader).not.toHaveBeenCalledWith('connection', expect.anything());
        expect(mockRes.res.setHeader).not.toHaveBeenCalledWith('keep-alive', expect.anything());
        expect(mockRes.res.setHeader).not.toHaveBeenCalledWith('content-length', expect.anything());
        expect(mockRes.res.setHeader).not.toHaveBeenCalledWith('access-control-allow-origin', expect.anything());
        expect(mockRes.res.setHeader).toHaveBeenCalledWith('x-request-id', 'req-xyz');
    });

    it('should filter hop-by-hop and CORS headers on the streamed path when the flag is on', () => {
        const mockRes = createMockResponse();
        const mockResponseStream = createMockResponseStream('raw binary content', {
            contentType: 'application/pdf',
            headers: {
                'content-length': '18',
                'content-disposition': 'attachment; filename="report.pdf"',
                connection: 'keep-alive',
                'access-control-allow-origin': '*',
                'x-request-id': 'req-xyz'
            }
        });

        handleResponse({ res: mockRes.res, responseStream: mockResponseStream, logCtx: mockLogCtx, forwardAllResponseHeaders: true });

        const [, headersArg] = vi.mocked(mockRes.res.writeHead).mock.calls[0]!;
        expect(headersArg).toHaveProperty('content-length', '18');
        expect(headersArg).toHaveProperty('x-request-id', 'req-xyz');
        expect(headersArg).not.toHaveProperty('connection');
        expect(headersArg).not.toHaveProperty('access-control-allow-origin');
    });

    it('should strip content-length when axios decompressed a gzip-encoded response', () => {
        const mockRes = createMockResponse();
        const mockResponseStream = createMockResponseStream('decompressed content', {
            contentType: 'application/octet-stream',
            headers: {
                'content-length': '500',
                'content-disposition': 'attachment; filename="file.bin"'
                // content-encoding absent: axios stripped it after decompression
            },
            wasCompressed: true
        });

        handleResponse({ res: mockRes.res, responseStream: mockResponseStream, logCtx: mockLogCtx, forwardAllResponseHeaders: true });

        const [, headersArg] = vi.mocked(mockRes.res.writeHead).mock.calls[0]!;
        expect(headersArg).not.toHaveProperty('content-length');
    });

    it('should preserve content-length for uncompressed attachment responses', () => {
        const mockRes = createMockResponse();
        const mockResponseStream = createMockResponseStream('raw binary content', {
            contentType: 'application/pdf',
            headers: {
                'content-length': '18',
                'content-disposition': 'attachment; filename="report.pdf"'
            }
        });

        handleResponse({ res: mockRes.res, responseStream: mockResponseStream, logCtx: mockLogCtx, forwardAllResponseHeaders: true });

        const [, headersArg] = vi.mocked(mockRes.res.writeHead).mock.calls[0]!;
        expect(headersArg).toHaveProperty('content-length', '18');
    });

    it('terminates a buffered response when the provider stream errors', async () => {
        const mockRes = createMockResponse();
        const error = new Error('provider stream failed');
        const body = new PassThrough();
        const responseStream: ProxyServiceResponse = {
            outcome: 'success',
            status: 200,
            headers: { 'content-type': 'application/json' },
            body,
            complete: vi.fn().mockResolvedValue(undefined)
        };

        handleResponse({ res: mockRes.res, responseStream, logCtx: mockLogCtx });
        body.destroy(error);

        await vi.waitFor(() => expect(responseStream.complete).toHaveBeenCalledWith(error));
        expect(mockRes.res.status).toHaveBeenCalledWith(500);
        expect(mockRes.res.send).toHaveBeenCalledWith();
    });

    it('destroys a streamed response when the provider stream errors', async () => {
        const mockRes = createMockResponse();
        const error = new Error('provider stream failed');
        const body = new PassThrough();
        const responseStream: ProxyServiceResponse = {
            outcome: 'success',
            status: 200,
            headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment' },
            body,
            complete: vi.fn().mockResolvedValue(undefined)
        };

        handleResponse({ res: mockRes.res, responseStream, logCtx: mockLogCtx });
        body.destroy(error);

        await vi.waitFor(() => expect(responseStream.complete).toHaveBeenCalledWith(error));
        expect(mockRes.res.destroy).toHaveBeenCalledWith(error);
    });

    it('records a buffered write failure without also completing successfully', async () => {
        const mockRes = createMockResponse();
        const error = new Error('write failed');
        const responseStream = createMockResponseStream('{"ok":true}');
        vi.mocked(mockRes.res.send).mockImplementation(() => {
            throw error;
        });

        handleResponse({ res: mockRes.res, responseStream, logCtx: mockLogCtx });

        await vi.waitFor(() => expect(responseStream.complete).toHaveBeenCalledWith(error));
        expect(responseStream.complete).toHaveBeenCalledOnce();
        expect(mockLogCtx.error).toHaveBeenCalledWith('Failed to write response', { error });
    });
});
/* eslint-enable @typescript-eslint/unbound-method */

/* eslint-disable @typescript-eslint/unbound-method */
describe('proxy error responses', () => {
    const mockLogCtx = {
        success: vi.fn(),
        failed: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        accountId: 1
    } as unknown as LogContext;

    it('formats service errors without coupling the service to Express', () => {
        const res = {
            status: vi.fn().mockReturnThis(),
            send: vi.fn()
        } as unknown as Response;
        const error = new ProxyServiceError({
            code: 'base_url_override_not_allowed',
            message: 'This base URL override is not allowed by server configuration.',
            status: 400
        });

        handleProxyServiceErrorResponse(res, error);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.send).toHaveBeenCalledWith({
            error: {
                code: 'base_url_override_not_allowed',
                message: 'This base URL override is not allowed by server configuration.'
            }
        });
    });

    it('returns a server error and logs an unexpected service error code', () => {
        const res = {
            status: vi.fn().mockReturnThis(),
            send: vi.fn()
        } as unknown as Response;
        const error = new ProxyServiceError({ code: 'internal_error', message: 'sensitive internal error', status: 500 });
        Object.assign(error, { code: 'unexpected_code' });

        const controllerLogger = getLogger('Proxy.Controller');
        let errorPrototype: object = controllerLogger;
        while (errorPrototype && !Object.prototype.hasOwnProperty.call(errorPrototype, 'error')) {
            errorPrototype = Object.getPrototypeOf(errorPrototype) as object;
        }
        const errorSpy = vi.spyOn(errorPrototype as { error: (...args: unknown[]) => unknown }, 'error').mockImplementation(() => undefined);

        try {
            handleProxyServiceErrorResponse(res, error);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.send).toHaveBeenCalledWith();
            expect(errorSpy).toHaveBeenCalledWith('Unexpected ProxyService error code while formatting proxy response', { code: 'unexpected_code' });
            expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('sensitive internal error');
        } finally {
            errorSpy.mockRestore();
        }
    });

    it('buffers and independently formats upstream error responses', async () => {
        const body = '{"error":"This event is not found (4)!"}';
        const stream = Readable.from([body]);
        const sendFn = vi.fn();
        const res = {
            status: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            send: sendFn
        } as unknown as Response;
        const responseStream = {
            status: 404,
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: stream
        };
        const onEgressedBytes = vi.fn();

        const endPromise = new Promise<void>((resolve) => {
            stream.once('end', () => resolve());
        });
        handleErrorResponse({ res, responseStream, logCtx: mockLogCtx, onEgressedBytes });
        await endPromise;

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'content-type': 'application/json; charset=utf-8' }));
        expect(sendFn).toHaveBeenCalledWith(body);
        expect(mockLogCtx.error).toHaveBeenCalledWith('Failed with this body', {
            body: expect.objectContaining({ error: 'This event is not found (4)!' })
        });
        expect(sendFn).toHaveBeenCalledOnce();
        expect(onEgressedBytes).toHaveBeenCalledWith(Buffer.byteLength(body));
    });

    it('returns a server error when the upstream error stream closes before ending', async () => {
        const stream = new PassThrough();
        const res = {
            headersSent: false,
            status: vi.fn().mockReturnThis(),
            send: vi.fn()
        } as unknown as Response;
        const responseStream = {
            status: 502,
            headers: {},
            body: stream
        };
        const onEgressedBytes = vi.fn();
        const closePromise = new Promise<void>((resolve) => {
            stream.once('close', () => resolve());
        });

        handleErrorResponse({ res, responseStream, logCtx: mockLogCtx, onEgressedBytes });
        stream.destroy();
        await closePromise;

        expect(mockLogCtx.error).toHaveBeenCalledWith('Upstream error stream closed before ending');
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.send).toHaveBeenCalledWith();
        expect(onEgressedBytes).toHaveBeenCalledWith(0);
    });
});
/* eslint-enable @typescript-eslint/unbound-method */
