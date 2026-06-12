import { afterEach, describe, expect, it, vi } from 'vitest';

// isAllowedWebCorsOrigin reads basePublicUrl/baseUrl/isLocal from @nangohq/utils at module
// load, so we mock the module and re-import the unit fresh for each environment scenario.
async function loadIsAllowed(utils: { basePublicUrl: string; baseUrl: string; isLocal: boolean }) {
    vi.resetModules();
    vi.doMock('@nangohq/utils', () => utils);
    return (await import('./cors.js')).isAllowedWebCorsOrigin;
}

afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@nangohq/utils');
});

describe('isAllowedWebCorsOrigin — cloud (isLocal=false)', () => {
    const utils = { basePublicUrl: 'https://app-development.nango.dev', baseUrl: 'https://api-development.nango.dev', isLocal: false };

    it('allows exact basePublicUrl', async () => {
        expect((await loadIsAllowed(utils))('https://app-development.nango.dev')).toBe(true);
    });

    it('allows exact baseUrl', async () => {
        expect((await loadIsAllowed(utils))('https://api-development.nango.dev')).toBe(true);
    });

    it('allows PR preview subdomains', async () => {
        const isAllowed = await loadIsAllowed(utils);
        expect(isAllowed('https://pr-123.app-development.nango.dev')).toBe(true);
        expect(isAllowed('https://pr-0.app-development.nango.dev')).toBe(true);
        expect(isAllowed('https://pr-99999.app-development.nango.dev')).toBe(true);
    });

    it('blocks non-pr-N subdomains', async () => {
        const isAllowed = await loadIsAllowed(utils);
        expect(isAllowed('https://evil.app-development.nango.dev')).toBe(false);
        expect(isAllowed('https://pr-abc.app-development.nango.dev')).toBe(false);
        expect(isAllowed('https://pr-.app-development.nango.dev')).toBe(false);
    });

    it('blocks subdomains of a different host', async () => {
        const isAllowed = await loadIsAllowed(utils);
        expect(isAllowed('https://pr-123.evil.nango.dev')).toBe(false);
        expect(isAllowed('https://pr-123.nango.dev')).toBe(false);
    });

    it('allows requests with no origin (same-origin / server-to-server)', async () => {
        expect((await loadIsAllowed(utils))(undefined)).toBe(true);
    });

    it('blocks malformed origin strings', async () => {
        expect((await loadIsAllowed(utils))('not-a-url')).toBe(false);
    });

    it('blocks non-https preview origins', async () => {
        expect((await loadIsAllowed(utils))('http://pr-123.app-development.nango.dev')).toBe(false);
    });

    it('blocks preview origins with non-standard ports', async () => {
        expect((await loadIsAllowed(utils))('https://pr-123.app-development.nango.dev:444')).toBe(false);
    });

    it('blocks multi-label preview origins (e.g. pr-123.foo.publicHost)', async () => {
        expect((await loadIsAllowed(utils))('https://pr-123.foo.app-development.nango.dev')).toBe(false);
    });

    it('blocks localhost origins when not local (proxy/rewrite territory, not direct)', async () => {
        const isAllowed = await loadIsAllowed(utils);
        expect(isAllowed('http://localhost:3000')).toBe(false);
        expect(isAllowed('http://localhost:3001')).toBe(false);
    });
});

describe('isAllowedWebCorsOrigin — local dev (isLocal=true)', () => {
    const utils = { basePublicUrl: 'http://localhost:3000', baseUrl: 'http://localhost:3003', isLocal: true };

    it('allows any localhost port (multi-worktree dashboards)', async () => {
        const isAllowed = await loadIsAllowed(utils);
        expect(isAllowed('http://localhost:3000')).toBe(true);
        expect(isAllowed('http://localhost:3001')).toBe(true);
        expect(isAllowed('http://localhost:54321')).toBe(true);
    });

    it('allows 127.0.0.1 on any port', async () => {
        expect((await loadIsAllowed(utils))('http://127.0.0.1:3002')).toBe(true);
    });

    it('still blocks non-localhost origins', async () => {
        const isAllowed = await loadIsAllowed(utils);
        expect(isAllowed('http://evil.com')).toBe(false);
        expect(isAllowed('https://evil.nango.dev')).toBe(false);
    });

    it('still blocks localhost-lookalike hosts', async () => {
        expect((await loadIsAllowed(utils))('https://localhost.evil.com')).toBe(false);
    });
});
