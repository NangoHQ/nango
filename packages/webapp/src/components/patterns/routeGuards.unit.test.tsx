// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError } from '../../utils/api';
import { PrivateRoute } from './PrivateRoute';
import { SignedOutRoute } from './SignedOutRoute';

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
const user = { id: 1, email: 'user@example.com' };

function apiError(status: number, code: string) {
    return new APIError({ res: new Response(null, { status }), json: { error: { code } } });
}

const PRIVATE = '/dev/connections';
const SIGNIN = '/signin?next=%2Fdev%2Fconnections';

const userStates = {
    'loaded user': { state: () => ({ user, userError: undefined }), ends: { [PRIVATE]: '/dev/connections', [SIGNIN]: '/dev/connections' } },
    'loaded user, failed refetch': {
        state: () => ({ user, userError: { error: { code: 'server_error' } } }),
        ends: { [PRIVATE]: '/dev/connections', [SIGNIN]: '/signin' }
    },
    'no user, API error': {
        state: () => ({ user: undefined, userError: { error: { code: 'server_error' } } }),
        ends: { [PRIVATE]: '/signin', [SIGNIN]: '/signin' }
    },
    'no user, network error': { state: () => ({ user: undefined, userError: undefined }), ends: { [PRIVATE]: '/dev/connections', [SIGNIN]: '/signin' } }
};

const metaStates = {
    'loaded meta': () => ({ meta, metaError: null }),
    'loaded meta, network error': () => ({ meta, metaError: new TypeError('Failed to fetch') }),
    'no meta, network error': () => ({ meta: undefined, metaError: new TypeError('Failed to fetch') }),
    'no meta, server error': () => ({ meta: undefined, metaError: apiError(500, 'server_error') }),
    'no meta, other 401': () => ({ meta: undefined, metaError: apiError(401, 'plan_not_found') }),
    'no meta, no session': () => ({ meta: undefined, metaError: apiError(401, 'unauthorized') })
};

const cases = Object.entries(userStates).flatMap(([userLabel, { state: userState, ends }]) =>
    Object.entries(metaStates).flatMap(([metaLabel, metaState]) =>
        ([PRIVATE, SIGNIN] as const).map((start) => ({
            name: `${userLabel} + ${metaLabel}, from ${start}`,
            userState,
            metaState,
            start,
            end: ends[start]
        }))
    )
);

const MAX_NAVIGATIONS = 20;

describe('PrivateRoute and SignedOutRoute together', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        mocks.storeState = { env: 'dev', setEnvs: vi.fn(), setBaseUrl: vi.fn(), setDebugMode: vi.fn(), setEnv: vi.fn() };
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it.each(cases)('settles on one page: $name', async ({ userState, metaState, start, end }) => {
        Object.assign(mocks, userState(), metaState());

        const router = createMemoryRouter(
            [
                { element: <SignedOutRoute />, children: [{ path: '/signin', element: <p>signin</p> }] },
                { element: <PrivateRoute />, children: [{ path: '/dev/connections', element: <p>connections</p> }] }
            ],
            { initialEntries: [start] }
        );
        let navigations = 0;
        router.subscribe(() => {
            navigations += 1;
            // A looping pair never stops navigating, so without this the test hangs instead of failing.
            if (navigations > MAX_NAVIGATIONS) {
                router.dispose();
            }
        });

        for (let tick = 0; tick < 5; tick++) {
            await act(async () => {
                if (tick === 0) {
                    root.render(<RouterProvider router={router} />);
                }
                await Promise.resolve();
            });
        }

        expect(navigations).toBeLessThanOrEqual(2);
        expect(router.state.location.pathname).toBe(end);
        expect(container.textContent).toBe(expectedPage(end));
    });
});

function expectedPage(end: string): string {
    if (end === '/signin') {
        return 'signin';
    }
    if (mocks.user && mocks.meta) {
        return 'connections';
    }
    return '';
}
