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

// With a relative base (vite `base: './'`) the basepath can't come from import.meta.env.BASE_URL.
// The document always loads at the base root or a depth-1 route, so '.' resolves to the base path.
export function basepathFromDocumentBaseURI(baseURI: string): string | undefined {
    const pathname = new URL('.', baseURI).pathname;
    return pathname === '/' ? undefined : pathname.replace(/\/$/, '');
}

export const router = createRouter({ routeTree, basepath: basepathFromDocumentBaseURI(document.baseURI) });
