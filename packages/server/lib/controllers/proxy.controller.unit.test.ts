import { expect, describe, it } from 'vitest';
import proxyController from './proxy.controller.js';

describe('Proxy Controller Construct URL Tests', () => {
    it('Should parse headers that starts with Nango-Proxy or nango-proxy', () => {
        const req: any = {
            rawHeaders: ['Nango-Proxy-Test-Header', 'TestValue', 'nango-proxy-another-header', 'AnotherValue', 'Irrelevant-Header', 'IrrelevantValue']
        };

        // @ts-ignore
        const parsedHeaders = proxyController.parseHeaders(req);

        expect(parsedHeaders).toEqual({
            'Test-Header': 'TestValue',
            'another-header': 'AnotherValue'
        });
    });

    it('Should return an empty object when there are no Nango-Proxy or nango-proxy headers', () => {
        const req: any = {
            rawHeaders: ['Irrelevant-Header-One', 'IrrelevantValueOne', 'Irrelevant-Header-Two', 'IrrelevantValueTwo']
        };

        // @ts-ignore
        const parsedHeaders = proxyController.parseHeaders(req);

        expect(parsedHeaders).toEqual({});
    });

    it('Should handle the case when rawHeaders is not an array or empty', () => {
        const req: any = {};

        // @ts-ignore
        const parsedHeaders = proxyController.parseHeaders(req);

        expect(parsedHeaders).toEqual({});
    });
});
