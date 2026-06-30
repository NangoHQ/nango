import { describe, expect, it } from 'vitest';

import { webhookUrlSchema } from './validation.js';

const accepts = (url: string | undefined) => webhookUrlSchema.safeParse(url).success;

describe('webhookUrlSchema', () => {
    it('accepts valid external URLs and empty/undefined', () => {
        expect(accepts('https://example.com/hook')).toBe(true);
        expect(accepts('')).toBe(true);
        expect(accepts(undefined)).toBe(true);
    });

    it('rejects malformed URLs', () => {
        expect(accepts('not-a-url')).toBe(false);
    });

    it("rejects Nango's domain and its subdomains", () => {
        expect(accepts('https://nango.dev/hook')).toBe(false);
        expect(accepts('https://api.nango.dev/hook')).toBe(false);
    });

    // Regression: the domain restriction must not be bypassable via a trailing dot, a port, or casing.
    it('rejects nango.dev bypass attempts', () => {
        expect(accepts('https://nango.dev./hook')).toBe(false); // trailing dot
        expect(accepts('https://nango.dev:8443/hook')).toBe(false); // non-default port
        expect(accepts('https://nango.dev:443/hook')).toBe(false);
        expect(accepts('https://api.nango.dev./hook')).toBe(false); // subdomain + trailing dot
        expect(accepts('https://nango.dev.:443/hook')).toBe(false);
        expect(accepts('HTTPS://NANGO.DEV./hook')).toBe(false);
    });

    it('allows unrelated domains that merely share the suffix', () => {
        expect(accepts('https://notnango.dev/hook')).toBe(true);
    });

    it('rejects denylisted hosts (e.g. localhost)', () => {
        expect(accepts('http://localhost/hook')).toBe(false);
    });
});
