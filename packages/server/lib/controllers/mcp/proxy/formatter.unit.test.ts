import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { proxyResponseToMcp } from './formatter.js';

import type { ProxyServiceResponse } from '../../../services/proxy.service.js';

describe('proxyResponseToMcp', () => {
    it('returns normal JSON while preserving unsafe and high-precision numbers as strings', async () => {
        const response = createResponse(
            '{"count":42,"safe":9007199254740991,"unsafe":7584781588001541408,"decimal":0.1234567890123456}',
            'Application/Problem+JSON; Charset=UTF-8'
        );

        await expect(proxyResponseToMcp(response)).resolves.toStrictEqual({
            status: 200,
            headers: { 'content-type': 'Application/Problem+JSON; Charset=UTF-8' },
            body: {
                count: 42,
                safe: 9007199254740991,
                unsafe: '7584781588001541408',
                decimal: '0.1234567890123456'
            }
        });
    });

    it('accepts UTF-8 text when the content type is textual or omitted', async () => {
        await expect(proxyResponseToMcp(createResponse('Olá 👋', 'text/plain; charset=utf-8'))).resolves.toMatchObject({ body: 'Olá 👋' });
        await expect(proxyResponseToMcp(createResponse('no content type'))).resolves.toMatchObject({ body: 'no content type' });
    });

    it('rejects binary content before reading it', async () => {
        const response = createResponse(Buffer.from([0xff, 0x00, 0xfe]), 'application/octet-stream');
        const destroySpy = vi.spyOn(response.body, 'destroy');

        await expect(proxyResponseToMcp(response)).rejects.toMatchObject({
            code: 'unsupported_response_body',
            message: expect.stringContaining('HTTP proxy')
        });
        expect(destroySpy).toHaveBeenCalledOnce();
    });

    it('rejects invalid UTF-8 and explicitly unsupported character sets', async () => {
        await expect(proxyResponseToMcp(createResponse(Buffer.from([0xff]), 'text/plain'))).rejects.toMatchObject({
            code: 'unsupported_response_body'
        });
        await expect(proxyResponseToMcp(createResponse('olá', 'text/plain; charset=iso-8859-1'))).rejects.toMatchObject({
            code: 'unsupported_response_body'
        });
    });

    it('accepts a response at the byte limit and aborts one byte over it', async () => {
        await expect(proxyResponseToMcp(createResponse('test', 'text/plain'), { maxBodyBytes: 4 })).resolves.toMatchObject({ body: 'test' });

        const response = createResponse('tests', 'text/plain');
        const destroySpy = vi.spyOn(response.body, 'destroy');
        await expect(proxyResponseToMcp(response, { maxBodyBytes: 4 })).rejects.toMatchObject({
            code: 'response_too_large',
            message: expect.stringContaining('HTTP proxy')
        });
        expect(destroySpy).toHaveBeenCalledOnce();
    });
});

function createResponse(body: string | Buffer, contentType?: string): ProxyServiceResponse {
    return {
        outcome: 'success',
        status: 200,
        headers: contentType ? { 'content-type': contentType } : {},
        body: Readable.from([body])
    };
}
