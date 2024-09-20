import { QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query';
import { RouterProvider, createRouter, createRootRoute } from '@tanstack/react-router';
import { ErrorBoundary } from 'react-error-boundary';

import { ErrorFallback } from './components/ErrorFallback.js';
import { queryClient } from './lib/query.js';
import { IntegrationsList } from './views/IntegrationsList.js';

const rootRoute = createRootRoute({
    component: IntegrationsList
});

const routeTree = rootRoute.addChildren([]);

const router = createRouter({ routeTree });

export const App: React.FC = () => {
    return (
        <QueryErrorResetBoundary>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
                <QueryClientProvider client={queryClient}>
                    <RouterProvider router={router} />
                </QueryClientProvider>
            </ErrorBoundary>
        </QueryErrorResetBoundary>
    );
};
