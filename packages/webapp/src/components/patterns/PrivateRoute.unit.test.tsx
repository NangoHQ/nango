// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError } from '../../utils/api';
import { PrivateRoute } from './PrivateRoute';

import type { Root } from 'react-dom/client';

const mocks = vi.hoisted(() => {
    vi.stubGlobal('_env', { apiUrl: 'http://localhost:3003', dashboardApiUrl: 'http://localhost:3003' });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    return {
        user: undefined as Record<string, unknown> | undefined,
        userError: undefined as unknown,
        meta: undefined as Record<string, unknown> | undefined,
        metaError: null as unknown,
        storeState: {} as Record<string, unknown>
    };
});

vi.mock('../../hooks/useUser', () => ({
    useUser: () => ({ user: mocks.user, loading: false, error: mocks.userError })
}));
vi.mock('../../hooks/useMeta', () => ({
    useMeta: () => ({ data: mocks.meta ? { data: mocks.meta } : undefined, error: mocks.metaError })
}));
vi.mock('../../hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock('../../utils/analytics', () => ({ useAnalyticsIdentify: () => vi.fn(), resumeAnalytics: vi.fn(), stopAnalytics: vi.fn() }));
vi.mock('../../store', () => ({
    useStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.storeState)
}));
vi.mock('../../pages/PageNotFound', () => ({ default: () => <p>not found</p> }));
vi.mock('../../pages/PageEnvironmentUnauthorized', () => ({ default: () => <p>unauthorized</p> }));

const meta = { environments: [{ id: 1, name: 'dev', account_id: 1, is_production: false }], baseUrl: '', debugMode: false, accountGroup: {} };

function apiError(status: number, code: string) {
    return new APIError({ res: new Response(null, { status }), json: { error: { code } } });
}

describe('PrivateRoute', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        mocks.user = { id: 1, email: 'user@example.com' };
        mocks.userError = undefined;
        mocks.meta = undefined;
        mocks.metaError = null;
        mocks.storeState = { env: 'dev', setEnvs: vi.fn(), setBaseUrl: vi.fn(), setDebugMode: vi.fn(), setEnv: vi.fn() };
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    async function renderAt(path: string) {
        const router = createMemoryRouter(
            [
                { element: <PrivateRoute />, children: [{ path: '/dev/connections', element: <p>connections</p> }] },
                { path: '/signin', element: <p>signin</p> }
            ],
            { initialEntries: [path] }
        );
        await act(async () => {
            root.render(<RouterProvider router={router} />);
            await Promise.resolve();
        });
        return router;
    }

    it('keeps a signed-in user off /signin when meta never loaded', async () => {
        mocks.metaError = new TypeError('Failed to fetch');

        const router = await renderAt('/dev/connections');

        expect(router.state.location.pathname).toBe('/dev/connections');
    });

    it('keeps the page when a meta refetch fails after it loaded', async () => {
        mocks.meta = meta;
        mocks.metaError = new TypeError('Failed to fetch');

        const router = await renderAt('/dev/connections');

        expect(router.state.location.pathname).toBe('/dev/connections');
        expect(container.textContent).toBe('connections');
    });

    it('renders nothing while a no-session meta error signs the user out', async () => {
        mocks.metaError = apiError(401, 'unauthorized');

        const router = await renderAt('/dev/connections');

        expect(router.state.location.pathname).toBe('/dev/connections');
        expect(container.textContent).toBe('');
    });

    it('sends a user who failed to load to /signin', async () => {
        mocks.user = undefined;
        mocks.userError = { error: { code: 'server_error' } };

        const router = await renderAt('/dev/connections');

        expect(router.state.location.pathname).toBe('/signin');
    });
});
