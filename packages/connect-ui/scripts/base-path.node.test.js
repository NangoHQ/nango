import { describe, expect, it } from 'vitest';

import { resolveBasePath } from './base-path.js';

describe('resolveBasePath', () => {
    it('defaults to root', () => {
        expect(resolveBasePath({})).toBe('/');
    });

    it('derives the path from NANGO_PUBLIC_CONNECT_URL', () => {
        expect(resolveBasePath({ NANGO_PUBLIC_CONNECT_URL: 'https://example.com/nango/connect' })).toBe('/nango/connect/');
    });

    it('lets NANGO_CONNECT_UI_BASE_PATH override, normalizing slashes', () => {
        expect(resolveBasePath({ NANGO_CONNECT_UI_BASE_PATH: 'nango/connect' })).toBe('/nango/connect/');
    });

    it('drops a query or fragment mistakenly passed in the override', () => {
        expect(resolveBasePath({ NANGO_CONNECT_UI_BASE_PATH: '/nango/connect?foo=bar#baz' })).toBe('/nango/connect/');
    });

    it('rejects a base path with unsafe characters', () => {
        expect(() => resolveBasePath({ NANGO_CONNECT_UI_BASE_PATH: '/a"><script>alert(1)</script>' })).toThrow(/Invalid Connect UI base path/);
    });
});
