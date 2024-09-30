import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

import { Go } from '@/views/Go';
import { IntegrationsList } from '@/views/IntegrationsList';

const rootRoute = createRootRoute({});
export const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IntegrationsList
});

export const goRouter = createRoute({
    path: '/go',
    component: Go,
    getParentRoute: () => rootRoute
});

export const routeTree = rootRoute.addChildren([indexRoute, goRouter]);

export const router = createRouter({ routeTree });
