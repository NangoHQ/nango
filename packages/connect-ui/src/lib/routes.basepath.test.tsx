import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import { routeTree } from './routes';

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

        const matched = router.state.matches.map((m) => m.routeId);
        expect(matched).toContain('/integrations');
    });

    it('matches the index route at the base path root', async () => {
        const router = routerAt(`${basepath}/`);
        await router.load();

        const matched = router.state.matches.map((m) => m.routeId);
        expect(matched).toContain('/');
    });

    it('prepends the base path when building in-app links', () => {
        const router = routerAt(`${basepath}/`);

        expect(router.buildLocation({ to: '/integrations' }).href).toBe(`${basepath}/integrations`);
        expect(router.buildLocation({ to: '/go' }).href).toBe(`${basepath}/go`);
    });
});
