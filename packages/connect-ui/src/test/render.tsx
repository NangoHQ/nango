import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { render } from 'vitest-browser-react';

import { I18nProvider } from '@/lib/i18n';
import { routeTree } from '@/lib/routes';
import { useGlobal } from '@/lib/store';

import type { RenderResult } from 'vitest-browser-react';

type StorePatch = Partial<ReturnType<typeof useGlobal.getState>>;

// Reset to a known store state on every render so nothing leaks between tests (vitest-browser-react
// has already unmounted the previous tree by the time the next test calls renderApp).
const STORE_DEFAULTS: StorePatch = {
    sessionToken: null,
    provider: null,
    integration: null,
    isDirty: false,
    isSingleIntegration: false,
    session: null,
    nango: null,
    apiURL: 'https://api.nango.dev',
    isEmbedded: false,
    isAuthLink: false,
    detectClosedAuthWindow: false,
    isPreview: false,
    showWatermark: false
};

/**
 * Renders the real app shell (Layout dialog + providers) at a given route, mirroring App.tsx
 * but with an isolated in-memory router and query client per test so nothing leaks between tests.
 * Seed `useGlobal` via `seedStore` to drive views that read provider/integration/session.
 */
export async function renderApp({ route, seedStore }: { route: string; seedStore?: StorePatch }): Promise<RenderResult> {
    useGlobal.setState({ ...STORE_DEFAULTS, ...seedStore });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [route] }) });

    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider defaultLanguage="en">
                <RouterProvider router={router} />
            </I18nProvider>
        </QueryClientProvider>
    );
}
