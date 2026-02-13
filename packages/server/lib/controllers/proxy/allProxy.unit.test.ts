import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { handleResponse, parseHeaders } from './allProxy.js';

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
                })
            } as unknown as Response,
            getSentData: () => sentData,
            getHeaders: () => headers,
            getStatusCode: () => statusCode,
            waitForSend: () => sendPromise
        };
    };

    const createMockResponseStream = (data: string, contentType = 'application/json', status = 200): AxiosResponse => {
        const stream = new Readable();
        stream.push(data);
        stream.push(null);

        return {
            status,
            headers: {
                'content-type': contentType
            },
            data: stream
        } as unknown as AxiosResponse;
    };

    it('should handle 204 No Content response', async () => {
        const mockRes = createMockResponse();
        const mockResponseStream = createMockResponseStream('', 'application/json', 204);

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
        const mockResponseStream = createMockResponseStream(nonJsonPayload, 'text/xml');

        handleResponse({ res: mockRes.res, responseStream: mockResponseStream, logCtx: mockLogCtx });
        await mockRes.waitForSend();

        const sentData = mockRes.getSentData();
        expect(sentData).toBeDefined();
        expect(sentData!.toString()).toBe(nonJsonPayload);
        expect(mockLogCtx.success).toHaveBeenCalled();
    });
});
/* eslint-enable @typescript-eslint/unbound-method */
