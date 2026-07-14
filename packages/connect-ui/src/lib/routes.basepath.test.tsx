import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import { resolveBasePath } from '../../scripts/base-path.js';
import { basepathFromBaseUrl, routeTree } from './routes';

// Connect UI can be served under a non-root base path (NAN-6242). The router's basepath is derived
// from import.meta.env.BASE_URL at runtime; these tests pin the two behaviors that base path relies
// on: matching an incoming deep URL, and generating in-app links with the prefix.
const basepath = '/nango/connect';

function routerAt(initialPath: string) {
    return createRouter({
        routeTree,
        basepath,
        history: createMemoryHistory({ initialEntries: [initialPath] })
    });
}

describe('router basepath', () => {
    it('matches a deep route requested under the base path', async () => {
        const router = routerAt(`${basepath}/integrations`);
        await router.load();

        const matched = router.state.matches.map((m: { routeId: string }) => m.routeId);
        expect(matched).toContain('/integrations');
    });

    it('matches the index route at the base path root', async () => {
        const router = routerAt(`${basepath}/`);
        await router.load();

        const matched = router.state.matches.map((m: { routeId: string }) => m.routeId);
        expect(matched).toContain('/');
    });

    it('prepends the base path when building in-app links', () => {
        const router = routerAt(`${basepath}/`);

        expect(router.buildLocation({ to: '/integrations' }).href).toBe(`${basepath}/integrations`);
        expect(router.buildLocation({ to: '/go' }).href).toBe(`${basepath}/go`);
    });
});

describe('basepathFromBaseUrl', () => {
    it('returns undefined for the root base', () => {
        expect(basepathFromBaseUrl('/')).toBeUndefined();
    });

    it('strips the trailing slash for a sub-path base', () => {
        expect(basepathFromBaseUrl('/nango/connect/')).toBe('/nango/connect');
    });
});

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
