import { QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';

import { queryClient } from './lib/query.js';
import { router } from './lib/routes.js';

export const App: React.FC = () => {
    return (
        <QueryErrorResetBoundary>
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </QueryErrorResetBoundary>
    );
};
