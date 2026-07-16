import { createHashHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

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

// Hash history: the bundle is built with a relative base (vite base './'), so assets resolve
// relative to the document URL. Routes must therefore live in the URL fragment — the document
// itself never leaves the base root, which keeps Connect UI servable under any hosting path.
export const router = createRouter({ routeTree, history: createHashHistory() });
