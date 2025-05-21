import { QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';

import { I18nProvider } from './lib/i18n';
import { detectLanguage } from './lib/i18n/utils';
import { queryClient } from './lib/query.js';
import { router } from './lib/routes.js';

export const App: React.FC = () => {
    const detectedLanguage = detectLanguage();

    return (
        <QueryErrorResetBoundary>
            <QueryClientProvider client={queryClient}>
                <I18nProvider defaultLanguage={detectedLanguage}>
                    <RouterProvider router={router} />
                </I18nProvider>
            </QueryClientProvider>
        </QueryErrorResetBoundary>
    );
};
