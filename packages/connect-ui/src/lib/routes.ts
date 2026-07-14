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

// `import.meta.env.BASE_URL` is the base path Connect UI is served under. It's baked in at build
// time and rewritten at container start (scripts/set-base-path.js), so routing works under a
// non-root path. TanStack Router wants the basepath without a trailing slash; root stays default.
export function basepathFromBaseUrl(baseUrl: string): string | undefined {
    return baseUrl === '/' ? undefined : baseUrl.replace(/\/$/, '');
}

export const router = createRouter({ routeTree, basepath: basepathFromBaseUrl(import.meta.env.BASE_URL) });
