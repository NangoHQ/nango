import { describe, expect, it } from 'vitest';

import { buildConnectUiSessionLink, resolveConnectUiUrl } from './connect-ui.js';

describe('resolveConnectUiUrl', () => {
    it('defaults to the local Connect UI URL', () => {
        expect(resolveConnectUiUrl({}).toString()).toBe('http://localhost:3009/');
    });

    it('uses the connect URL when no base path is set', () => {
        expect(resolveConnectUiUrl({ connectUrl: 'https://example.com/connect' }).toString()).toBe('https://example.com/connect');
    });

    it('applies the base path to the connect URL', () => {
        expect(resolveConnectUiUrl({ connectUrl: 'https://example.com/old-path', basePath: '/nango/connect' }).toString()).toBe(
            'https://example.com/nango/connect/'
        );
    });

    it('uses the base path with the default URL', () => {
        expect(resolveConnectUiUrl({ basePath: 'nango/connect' }).toString()).toBe('http://localhost:3009/nango/connect/');
    });
});

describe('buildConnectUiSessionLink', () => {
    it('builds session links under the effective Connect UI base path', () => {
        expect(
            buildConnectUiSessionLink('nango_connect_session_test', {
                connectUrl: 'https://example.com/old-path',
                basePath: '/nango/connect'
            })
        ).toBe('https://example.com/nango/connect/?session_token=nango_connect_session_test');
    });
});
