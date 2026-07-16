import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

import { ErrorFallbackGlobal } from '@/components/ErrorFallback';
import { Layout } from '@/components/Layout';
import { Go } from '@/views/Go';
import { Home } from '@/views/Home';
import { IntegrationsList } from '@/views/IntegrationsList';

const rootRoute = createRootRoute({
    component: Layout,
    errorComponent: ErrorFallbackGlobal
});

export const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Home
});

export const integrationsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/integrations',
    component: IntegrationsList
});

export const goRouter = createRoute({
    getParentRoute: () => rootRoute,
    path: '/go',
    component: Go
});

export const routeTree = rootRoute.addChildren([indexRoute, integrationsRoute, goRouter]);

// Connect UI is built with a relative base (vite `base: './'`) so a prebuilt bundle can be served
// under any path without rewriting. The basepath therefore can't come from import.meta.env.BASE_URL
// (it's the literal './'); derive it from the document URL instead. The document is always loaded at
// the base root ('{base}/') or at a depth-1 route under it ('{base}/integrations'), and no route ends
// with a trailing slash, so resolving '.' against document.baseURI yields the base path.
export function basepathFromDocumentBaseURI(baseURI: string): string | undefined {
    const pathname = new URL('.', baseURI).pathname;
    // TanStack Router wants the basepath without a trailing slash; root stays default.
    return pathname === '/' ? undefined : pathname.replace(/\/$/, '');
}

export const router = createRouter({ routeTree, basepath: basepathFromDocumentBaseURI(document.baseURI) });
