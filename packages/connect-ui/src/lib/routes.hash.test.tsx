import { createHashHistory, createRouter } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import { routeTree } from './routes';

// Connect UI is built with a relative asset base (vite base './'), which only works because
// routing lives in the URL fragment: the document path must stay at the base root under any
// hosting path (NAN-6242). These tests pin that invariant with the real window history.
describe('hash routing', () => {
    it('matches routes from the fragment and never moves the document path', async () => {
        const pathnameBefore = window.location.pathname;
        const searchBefore = window.location.search;
        const hashBefore = window.location.hash;

        const router = createRouter({ routeTree, history: createHashHistory() });
        await router.load();

        await router.navigate({ to: '/integrations' });
        expect(router.state.matches.map((m: { routeId: string }) => m.routeId)).toContain('/integrations');
        expect(window.location.hash).toBe('#/integrations');

        await router.navigate({ to: '/go' });
        expect(router.state.matches.map((m: { routeId: string }) => m.routeId)).toContain('/go');
        expect(window.location.hash).toBe('#/go');

        // The document URL outside the fragment is untouched: assets keep resolving relative to
        // the base root, and query params (session_token, config) survive navigation.
        expect(window.location.pathname).toBe(pathnameBefore);
        expect(window.location.search).toBe(searchBefore);

        // Don't leak the routed hash into other tests running on the same tester page.
        window.history.replaceState(null, '', pathnameBefore + searchBefore + hashBefore);
    });
});
