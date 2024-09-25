import { QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { ErrorBoundary } from 'react-error-boundary';

import { ErrorFallback } from './components/ErrorFallback.js';
import { queryClient } from './lib/query.js';
import { router } from './lib/routes.js';

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
