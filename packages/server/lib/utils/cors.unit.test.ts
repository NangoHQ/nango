import { describe, expect, it } from 'vitest';

import { isAllowedWebCorsOrigin } from './cors.js';

const allowedOrigins = new Set(['https://app-development.nango.dev', 'https://api-development.nango.dev']);
const publicHost = 'app-development.nango.dev';

describe('isAllowedWebCorsOrigin', () => {
    it('allows exact basePublicUrl', () => {
        expect(isAllowedWebCorsOrigin('https://app-development.nango.dev', allowedOrigins, publicHost)).toBe(true);
    });

    it('allows exact baseUrl', () => {
        expect(isAllowedWebCorsOrigin('https://api-development.nango.dev', allowedOrigins, publicHost)).toBe(true);
    });

    it('allows PR preview subdomains', () => {
        expect(isAllowedWebCorsOrigin('https://pr-123.app-development.nango.dev', allowedOrigins, publicHost)).toBe(true);
        expect(isAllowedWebCorsOrigin('https://pr-0.app-development.nango.dev', allowedOrigins, publicHost)).toBe(true);
        expect(isAllowedWebCorsOrigin('https://pr-99999.app-development.nango.dev', allowedOrigins, publicHost)).toBe(true);
    });

    it('blocks non-pr-N subdomains', () => {
        expect(isAllowedWebCorsOrigin('https://evil.app-development.nango.dev', allowedOrigins, publicHost)).toBe(false);
        expect(isAllowedWebCorsOrigin('https://pr-abc.app-development.nango.dev', allowedOrigins, publicHost)).toBe(false);
        expect(isAllowedWebCorsOrigin('https://pr-.app-development.nango.dev', allowedOrigins, publicHost)).toBe(false);
    });

    it('blocks subdomains of a different host', () => {
        expect(isAllowedWebCorsOrigin('https://pr-123.evil.nango.dev', allowedOrigins, publicHost)).toBe(false);
        expect(isAllowedWebCorsOrigin('https://pr-123.nango.dev', allowedOrigins, publicHost)).toBe(false);
    });

    it('allows requests with no origin (same-origin / server-to-server)', () => {
        expect(isAllowedWebCorsOrigin(undefined, allowedOrigins, publicHost)).toBe(true);
    });

    it('blocks malformed origin strings', () => {
        expect(isAllowedWebCorsOrigin('not-a-url', allowedOrigins, publicHost)).toBe(false);
    });

    it('blocks non-https preview origins', () => {
        expect(isAllowedWebCorsOrigin('http://pr-123.app-development.nango.dev', allowedOrigins, publicHost)).toBe(false);
    });

    it('blocks preview origins with non-standard ports', () => {
        expect(isAllowedWebCorsOrigin('https://pr-123.app-development.nango.dev:444', allowedOrigins, publicHost)).toBe(false);
    });

    it('blocks multi-label preview origins (e.g. pr-123.foo.publicHost)', () => {
        expect(isAllowedWebCorsOrigin('https://pr-123.foo.app-development.nango.dev', allowedOrigins, publicHost)).toBe(false);
    });
});
