// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError } from '../../utils/api';
import { GettingStarted } from './Show';

import type { Root } from 'react-dom/client';

const mocks = vi.hoisted(() => {
    vi.stubGlobal('_env', { apiUrl: 'http://localhost:3003', dashboardApiUrl: 'http://localhost:3003' });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    return { error: undefined as unknown, data: undefined as unknown };
});

vi.mock('../../hooks/useGettingStarted', () => ({
    useGettingStarted: () => ({ data: mocks.data, error: mocks.error, refetch: vi.fn(), isLoading: false }),
    patchGettingStarted: vi.fn()
}));
vi.mock('./FirstStep', () => ({ FirstStep: () => <p>first step</p> }));
vi.mock('./SecondStep', () => ({ SecondStep: () => null }));
vi.mock('./ThirdStep', () => ({ ThirdStep: () => null }));
vi.mock('../../assets/SlackIcon', () => ({ SlackIcon: () => null }));
vi.mock('../PageNotFound', () => ({ default: () => null }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../../store', () => ({ useStore: (selector: (state: Record<string, unknown>) => unknown) => selector({ env: 'dev' }) }));
vi.mock('../../layout/DashboardLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@sentry/react', () => ({ captureMessage: vi.fn() }));
vi.mock('react-helmet', () => ({ Helmet: () => null }));

describe('GettingStarted', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        mocks.error = undefined;
        mocks.data = undefined;
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    async function render() {
        const router = createMemoryRouter(
            [
                { path: '/dev/getting-started', element: <GettingStarted /> },
                { path: '/', element: <p>root</p> }
            ],
            { initialEntries: ['/dev/getting-started'] }
        );
        await act(async () => {
            root.render(<RouterProvider router={router} />);
            await Promise.resolve();
        });
        return router;
    }

    const rateLimited = () => new APIError({ res: new Response(null, { status: 429 }), json: { error: { code: 'too_many_request' } } });

    it('shows an error on the page instead of navigating away', async () => {
        mocks.error = rateLimited();

        const router = await render();

        expect(router.state.location.pathname).toBe('/dev/getting-started');
        expect(container.textContent).toContain('An error occurred');
    });

    it('keeps the loaded steps when a refetch fails', async () => {
        mocks.data = { data: { step: 1, connection: null, meta: { integration: null } } };
        mocks.error = rateLimited();

        const router = await render();

        expect(router.state.location.pathname).toBe('/dev/getting-started');
        expect(container.textContent).toContain('first step');
        expect(container.textContent).not.toContain('An error occurred');
    });
});
