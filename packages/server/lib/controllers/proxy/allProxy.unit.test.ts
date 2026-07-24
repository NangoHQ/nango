import { Readable } from 'node:stream';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProxyError } from '@nangohq/shared';
import { metrics } from '@nangohq/utils';

import { handleErrorResponse, handleResponse, parseHeaders, shouldForwardResponseHeader } from './allProxy.js';

import type { LogContext } from '@nangohq/logs';
import type { AxiosResponse } from 'axios';
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

        return {
            res: {
                setHeader: vi.fn((name: string, value: string) => {
                    headers[name] = value;
                }),
                send: vi.fn((data: Buffer) => {
                    sentData = data;
                    if (sendResolve) sendResolve();
                }),
                status: vi.fn((code: number) => {
                    statusCode = code;
                    return {
                        end: vi.fn(() => {
                            if (sendResolve) sendResolve();
                        })
                    };
                }),
                writeHead: vi.fn(),
                end: vi.fn(() => {
                    if (sendResolve) sendResolve();
                }),
                on: vi.fn().mockReturnThis(),
                once: vi.fn().mockReturnThis(),
                emit: vi.fn().mockReturnThis(),
                write: vi.fn()
            } as unknown as Response,
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
            request = {}
        }: { contentType?: string; status?: number; headers?: Record<string, string>; request?: object } = {}
    ): AxiosResponse => {
        const stream = new Readable();
        stream.push(data);
        stream.push(null);

        return {
            status,
            headers: { 'content-type': contentType, ...headers },
            request,
            data: stream
        } as unknown as AxiosResponse;
    };

    it('should handle 204 No Content response', async () => {
        const mockRes = createMockResponse();
        const mockResponseStream = createMockResponseStream('', { status: 204 });

        handleResponse({ res: mockRes.res, responseStream: mockResponseStream, logCtx: mockLogCtx });
        await mockRes.waitForSend();

        expect(mockRes.res.status).toHaveBeenCalledWith(204);
        expect(mockLogCtx.success).toHaveBeenCalled();
    });

    it('should validate that response is valid JSON', async () => {
        const validJson = '{"id": 123, "name": "test"}';
        const mockRes = createMockResponse();
        const mockResponseStream = createMockResponseStream(validJson);

        handleResponse({ res: mockRes.res, responseStream: mockResponseStream, logCtx: mockLogCtx });
        await mockRes.waitForSend();

        expect(mockRes.getSentData()!.toString()).toBe(validJson);
        expect(mockLogCtx.success).toHaveBeenCalled();
        expect(mockLogCtx.error).not.toHaveBeenCalled();
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
        expect(mockLogCtx.success).toHaveBeenCalled();
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
        expect(mockLogCtx.success).toHaveBeenCalled();
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
        expect(mockLogCtx.success).toHaveBeenCalled();
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
        expect(mockLogCtx.success).toHaveBeenCalled();
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
        expect(mockLogCtx.success).toHaveBeenCalled();
    });

    it('should filter hop-by-hop and CORS headers on the streamed path when the flag is on', async () => {
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

        await handleResponse({ res: mockRes.res, responseStream: mockResponseStream, logCtx: mockLogCtx, forwardAllResponseHeaders: true });

        const [, headersArg] = vi.mocked(mockRes.res.writeHead).mock.calls[0]!;
        expect(headersArg).toHaveProperty('content-length', '18');
        expect(headersArg).toHaveProperty('x-request-id', 'req-xyz');
        expect(headersArg).not.toHaveProperty('connection');
        expect(headersArg).not.toHaveProperty('access-control-allow-origin');
        expect(mockLogCtx.success).toHaveBeenCalled();
    });

    it('should strip content-length when axios decompressed a gzip-encoded response', async () => {
        const mockRes = createMockResponse();
        const mockResponseStream = createMockResponseStream('decompressed content', {
            contentType: 'application/octet-stream',
            headers: {
                'content-length': '500',
                'content-disposition': 'attachment; filename="file.bin"'
                // content-encoding absent: axios stripped it after decompression
            },
            request: {
                res: {
                    rawHeaders: ['Content-Encoding', 'gzip', 'Content-Length', '500', 'Content-Disposition', 'attachment; filename="file.bin"']
                }
            }
        });

        await handleResponse({ res: mockRes.res, responseStream: mockResponseStream, logCtx: mockLogCtx, forwardAllResponseHeaders: true });

        const [, headersArg] = vi.mocked(mockRes.res.writeHead).mock.calls[0]!;
        expect(headersArg).not.toHaveProperty('content-length');
        expect(mockLogCtx.success).toHaveBeenCalled();
    });

    it('should preserve content-length for uncompressed attachment responses', async () => {
        const mockRes = createMockResponse();
        const mockResponseStream = createMockResponseStream('raw binary content', {
            contentType: 'application/pdf',
            headers: {
                'content-length': '18',
                'content-disposition': 'attachment; filename="report.pdf"'
            }
        });

        await handleResponse({ res: mockRes.res, responseStream: mockResponseStream, logCtx: mockLogCtx, forwardAllResponseHeaders: true });

        const [, headersArg] = vi.mocked(mockRes.res.writeHead).mock.calls[0]!;
        expect(headersArg).toHaveProperty('content-length', '18');
        expect(mockLogCtx.success).toHaveBeenCalled();
    });
});
/* eslint-enable @typescript-eslint/unbound-method */

/* eslint-disable @typescript-eslint/unbound-method */
describe('handleErrorResponse', () => {
    const mockLogCtx = {
        success: vi.fn(),
        failed: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        accountId: 1
    } as unknown as LogContext;

    beforeEach(() => {
        vi.mocked(mockLogCtx.error).mockClear();
        vi.spyOn(metrics, 'increment').mockImplementation(() => {});
    });

    it('should return 400 for proxy_redirect_to_denied_host ProxyError', () => {
        const res = {
            status: vi.fn().mockReturnThis(),
            send: vi.fn(),
            set: vi.fn().mockReturnThis(),
            writeHead: vi.fn()
        } as unknown as Response;
        const err = new Error('Axios redirect aborted');
        err.cause = new ProxyError('proxy_redirect_to_denied_host', 'blocked');

        handleErrorResponse({ res, error: err, logCtx: mockLogCtx });

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.send).toHaveBeenCalledWith({
            error: {
                code: 'base_url_override_not_allowed',
                message: 'This base URL override is not allowed by server configuration.'
            }
        });
        expect(mockLogCtx.error).toHaveBeenCalledWith('Proxy redirect denied by denylist', { error: err.cause });
    });

    it('should return upstream status and send errorObject when Axios error has no response.data', () => {
        const res = {
            status: vi.fn().mockReturnThis(),
            send: vi.fn(),
            set: vi.fn().mockReturnThis(),
            writeHead: vi.fn()
        } as unknown as Response;
        const axiosError = {
            isAxiosError: true,
            response: { status: 502, headers: { 'x-request-id': 'abc' } },
            toJSON: () => ({ message: 'Bad Gateway', config: { method: 'GET' }, code: 'ERR_BAD_RESPONSE', status: 502 })
        };

        handleErrorResponse({ res, error: axiosError, requestConfig: { url: '/api' }, logCtx: mockLogCtx });

        expect(res.status).toHaveBeenCalledWith(502);
        expect(res.set).toHaveBeenCalledWith({ 'x-request-id': 'abc' });
        expect(res.send).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Bad Gateway',
                code: 'ERR_BAD_RESPONSE',
                status: 502,
                url: '/api',
                method: 'GET'
            })
        );
    });

    it('should filter hop-by-hop and CORS headers on the error path when the flag is on', () => {
        const res = {
            status: vi.fn().mockReturnThis(),
            send: vi.fn(),
            set: vi.fn().mockReturnThis(),
            writeHead: vi.fn()
        } as unknown as Response;
        const axiosError = {
            isAxiosError: true,
            response: {
                status: 502,
                headers: {
                    'x-request-id': 'abc',
                    connection: 'keep-alive',
                    'content-length': '12',
                    'access-control-allow-origin': '*'
                }
            },
            toJSON: () => ({ message: 'Bad Gateway', config: { method: 'GET' }, code: 'ERR_BAD_RESPONSE', status: 502 })
        };

        handleErrorResponse({ res, error: axiosError, requestConfig: { url: '/api' }, logCtx: mockLogCtx, forwardAllResponseHeaders: true });

        expect(res.set).toHaveBeenCalledWith({ 'x-request-id': 'abc' });
    });

    it('should use status 500 and full errorObject (message, stack, code, status, url, method) when Axios error has no response.data and toJSON provides stack', () => {
        const res = {
            status: vi.fn().mockReturnThis(),
            send: vi.fn(),
            set: vi.fn().mockReturnThis(),
            writeHead: vi.fn()
        } as unknown as Response;
        const axiosError = {
            isAxiosError: true,
            response: { headers: { 'content-type': 'application/json' } },
            toJSON: () => ({
                message: 'Request failed',
                stack: 'Error: Request failed\n    at httpCall (...)',
                config: { method: 'POST' },
                code: 'ERR_NETWORK',
                status: undefined
            })
        };

        handleErrorResponse({ res, error: axiosError, requestConfig: { url: 'https://api.example.com/foo' }, logCtx: mockLogCtx });

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.set).toHaveBeenCalledWith({ 'content-type': 'application/json' });
        expect(res.send).toHaveBeenCalledWith({
            message: 'Request failed',
            stack: 'Error: Request failed\n    at httpCall (...)',
            code: 'ERR_NETWORK',
            status: undefined,
            url: 'https://api.example.com/foo',
            method: 'POST'
        });
    });

    it('should buffer stream and return upstream status (e.g. 404) with body when Axios error has response.data stream', async () => {
        const body = '{"error":"This event is not found (4)!"}';
        const stream = Readable.from([body]);
        const sendFn = vi.fn();
        const res = {
            status: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            send: sendFn
        } as unknown as Response;
        const axiosError = {
            isAxiosError: true,
            response: {
                status: 404,
                headers: { 'content-type': 'application/json; charset=utf-8' },
                data: stream
            }
        };

        const endPromise = new Promise<void>((resolve) => {
            stream.once('end', () => resolve());
        });
        handleErrorResponse({ res, error: axiosError, logCtx: mockLogCtx });
        await endPromise;

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'content-type': 'application/json; charset=utf-8' }));
        expect(sendFn).toHaveBeenCalledWith(body);
        expect(mockLogCtx.error).toHaveBeenCalledWith('Failed with this body', {
            body: expect.objectContaining({ error: 'This event is not found (4)!' })
        });
    });
});
/* eslint-enable @typescript-eslint/unbound-method */
