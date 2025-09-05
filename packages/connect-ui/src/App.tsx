import { QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useSearchParam } from 'react-use';

import { I18nProvider } from './lib/i18n';
import { getLanguage } from './lib/i18n/utils.js';
import { queryClient } from './lib/query.js';
import { router } from './lib/routes.js';

export const App: React.FC = () => {
    const languageParam = useSearchParam('lang');
    const language = getLanguage(languageParam);

    document.documentElement.classList.add('dark');

    return (
        <QueryErrorResetBoundary>
            <QueryClientProvider client={queryClient}>
                <I18nProvider defaultLanguage={language}>
                    <RouterProvider router={router} />
                </I18nProvider>
            </QueryClientProvider>
        </QueryErrorResetBoundary>
    );
};
