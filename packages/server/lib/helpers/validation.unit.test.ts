import { describe, expect, it } from 'vitest';

import { integrationCredentialsSchema, webhookUrlSchema } from './validation.js';

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

describe('integrationCredentialsSchema (MCP_OAUTH2)', () => {
    it('accepts a fully omitted credentials object (dynamic/cimd client registration)', () => {
        const result = integrationCredentialsSchema.safeParse({ type: 'MCP_OAUTH2' });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual({ type: 'MCP_OAUTH2' });
        }
    });

    it('rejects explicit null for client_id/client_secret/scopes, same as every other credentials type', () => {
        const result = integrationCredentialsSchema.safeParse({
            type: 'MCP_OAUTH2',
            client_id: null,
            client_secret: null,
            scopes: null
        });
        expect(result.success).toBe(false);
    });

    it('accepts client_id/client_secret/scopes when provided as strings', () => {
        const result = integrationCredentialsSchema.safeParse({
            type: 'MCP_OAUTH2',
            client_id: 'abc',
            client_secret: 'def',
            scopes: 'offline_access,read'
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toStrictEqual({ type: 'MCP_OAUTH2', client_id: 'abc', client_secret: 'def', scopes: 'offline_access,read' });
        }
    });

    it("accepts space-delimited scopes matching OAuth2's standard scope wire format", () => {
        const result = integrationCredentialsSchema.safeParse({
            type: 'MCP_OAUTH2',
            scopes: 'read write'
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toStrictEqual({ type: 'MCP_OAUTH2', scopes: 'read write' });
        }
    });

    it('accepts a mix of commas and spaces in scopes', () => {
        const result = integrationCredentialsSchema.safeParse({
            type: 'MCP_OAUTH2',
            scopes: 'read, write offline_access'
        });
        expect(result.success).toBe(true);
    });
});
