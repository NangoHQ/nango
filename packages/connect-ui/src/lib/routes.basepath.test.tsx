import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import { basepathFromDocumentBaseURI, routeTree } from './routes';

// Connect UI can be served under a non-root base path (NAN-6242). The router's basepath is derived
// from document.baseURI at runtime; these tests pin the two behaviors that base path relies on:
// matching an incoming deep URL, and generating in-app links with the prefix.
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

describe('basepathFromDocumentBaseURI', () => {
    it('returns undefined for a root deploy', () => {
        expect(basepathFromDocumentBaseURI('https://example.com/')).toBeUndefined();
    });

    it('returns undefined for a deep-route refresh on a root deploy', () => {
        expect(basepathFromDocumentBaseURI('https://example.com/integrations')).toBeUndefined();
    });

    it('derives the base path from an entry URL with query params', () => {
        expect(basepathFromDocumentBaseURI('https://example.com/nango/connect/?session_token=abc')).toBe('/nango/connect');
    });

    it('derives the base path from a deep-route refresh under the base', () => {
        expect(basepathFromDocumentBaseURI('https://example.com/nango/connect/integrations')).toBe('/nango/connect');
    });

    it('mis-derives the base path when the base root URL lacks a trailing slash', () => {
        // A slashless base root is indistinguishable from a deep route, so the last segment is
        // dropped. This is why every URL producer normalizes the trailing slash (and index.html
        // self-heals it before assets load).
        expect(basepathFromDocumentBaseURI('https://example.com/nango/connect')).toBe('/nango');
    });
});
