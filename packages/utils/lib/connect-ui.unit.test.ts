import { describe, expect, it } from 'vitest';

import { buildConnectUiSessionLink, resolveConnectUiUrl } from './connect-ui.js';

describe('resolveConnectUiUrl', () => {
    it('defaults to the local Connect UI URL', () => {
        expect(resolveConnectUiUrl({}).toString()).toBe('http://localhost:3009/');
    });

    it('uses NANGO_PUBLIC_CONNECT_URL when no base path override is set', () => {
        expect(resolveConnectUiUrl({ NANGO_PUBLIC_CONNECT_URL: 'https://example.com/connect' }).toString()).toBe('https://example.com/connect');
    });

    it('applies NANGO_CONNECT_UI_BASE_PATH to the public Connect UI URL', () => {
        expect(
            resolveConnectUiUrl({
                NANGO_PUBLIC_CONNECT_URL: 'https://example.com/old-path',
                NANGO_CONNECT_UI_BASE_PATH: '/nango/connect'
            }).toString()
        ).toBe('https://example.com/nango/connect/');
    });

    it('uses the base path override with the default URL', () => {
        expect(resolveConnectUiUrl({ NANGO_CONNECT_UI_BASE_PATH: 'nango/connect' }).toString()).toBe('http://localhost:3009/nango/connect/');
    });
});

describe('buildConnectUiSessionLink', () => {
    it('builds session links under the effective Connect UI base path', () => {
        expect(
            buildConnectUiSessionLink('nango_connect_session_test', {
                NANGO_PUBLIC_CONNECT_URL: 'https://example.com/old-path',
                NANGO_CONNECT_UI_BASE_PATH: '/nango/connect'
            })
        ).toBe('https://example.com/nango/connect/?session_token=nango_connect_session_test');
    });
});
