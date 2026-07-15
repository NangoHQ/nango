import { describe, expect, it } from 'vitest';

import { resolveBasePath } from './base-path.js';

describe('resolveBasePath', () => {
    it('defaults to root', () => {
        expect(resolveBasePath({})).toBe('/');
    });

    it('derives the path from NANGO_PUBLIC_CONNECT_URL', () => {
        expect(resolveBasePath({ NANGO_PUBLIC_CONNECT_URL: 'https://example.com/nango/connect' })).toBe('/nango/connect/');
    });

    it('ignores query and fragment on NANGO_PUBLIC_CONNECT_URL', () => {
        expect(resolveBasePath({ NANGO_PUBLIC_CONNECT_URL: 'https://example.com/nango/connect?foo=bar#baz' })).toBe('/nango/connect/');
    });

    it('throws when NANGO_PUBLIC_CONNECT_URL is set but not a valid URL', () => {
        expect(() => resolveBasePath({ NANGO_PUBLIC_CONNECT_URL: 'not a url' })).toThrow(/Invalid NANGO_PUBLIC_CONNECT_URL/);
    });

    it('rejects a path with unsafe characters', () => {
        expect(() => resolveBasePath({ NANGO_PUBLIC_CONNECT_URL: 'https://example.com/a&b' })).toThrow(/Invalid Connect UI base path/);
    });
});
