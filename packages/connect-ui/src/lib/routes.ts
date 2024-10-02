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

export const router = createRouter({ routeTree });
