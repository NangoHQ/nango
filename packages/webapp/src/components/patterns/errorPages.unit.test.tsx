// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError } from '../../utils/api';
import { ErrorPageComponent } from './ErrorComponent';
import { RouteErrorPage } from './RouteErrorPage';

import type { Root } from 'react-dom/client';

const mocks = vi.hoisted(() => {
    vi.stubGlobal('_env', { apiUrl: 'http://localhost:3003', dashboardApiUrl: 'http://localhost:3003' });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    return { captureException: vi.fn() };
});

vi.mock('@sentry/react', () => ({ captureException: mocks.captureException }));
vi.mock('../../layout/DashboardLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../../pages/PageNotFound', () => ({ default: () => <p>not found</p> }));
vi.mock('./ErrorBoundary', () => ({ ErrorBoundary: () => <p>error page</p> }));
vi.mock('react-helmet', () => ({ Helmet: () => null }));

const Crash: React.FC = () => {
    throw new TypeError('Cannot read properties of undefined');
};

describe('error pages', () => {
    let container: HTMLDivElement;
    let root: Root;
    const silenceUncaught = (event: ErrorEvent) => event.preventDefault();

    beforeEach(() => {
        window.addEventListener('error', silenceUncaught);
        mocks.captureException.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        window.removeEventListener('error', silenceUncaught);
        vi.restoreAllMocks();
    });

    function render(element: React.ReactElement) {
        act(() => root.render(element));
    }

    async function renderRoute(element: React.ReactNode, url = '/') {
        const router = createMemoryRouter([{ errorElement: <RouteErrorPage />, children: [{ path: '/', element }] }], { initialEntries: [url] });
        await act(async () => {
            root.render(<RouterProvider router={router} />);
            await Promise.resolve();
        });
    }

    it('shows the error page and reports a page crash once', async () => {
        await renderRoute(<Crash />);

        expect(container.textContent).toBe('error page');
        expect(mocks.captureException).toHaveBeenCalledTimes(1);
        expect(mocks.captureException).toHaveBeenCalledWith(expect.any(TypeError), { tags: { error_page: 'route' } });
    });

    it('does not report an unmatched URL', async () => {
        await renderRoute(<p>home</p>, '/missing');

        expect(container.textContent).toBe('not found');
        expect(mocks.captureException).not.toHaveBeenCalled();
    });

    function apiError(status: number, code: string, payload?: string) {
        return new APIError({ res: new Response(null, { status }), json: { error: { code, payload } } });
    }

    it('reports the API error with its code and status', () => {
        const error = apiError(500, 'server_error');
        render(<ErrorPageComponent title="Connections" error={error} />);

        expect(mocks.captureException).toHaveBeenCalledWith(error, { tags: { error_page: 'Connections', code: 'server_error', status: 500 } });
    });

    it('reports a failed request with the original error', () => {
        const error = new TypeError('Failed to fetch');
        render(<ErrorPageComponent title="Integrations" error={error} />);

        expect(mocks.captureException).toHaveBeenCalledWith(error, { tags: { error_page: 'Integrations', code: 'unknown_error', status: 'none' } });
    });

    it('reports once while refetches keep failing', () => {
        render(<ErrorPageComponent title="Integrations" error={apiError(500, 'server_error')} />);
        render(<ErrorPageComponent title="Integrations" error={apiError(500, 'server_error')} />);

        expect(mocks.captureException).toHaveBeenCalledTimes(1);
    });

    it('reports again when a refetch fails differently', () => {
        render(<ErrorPageComponent title="Integrations" error={new TypeError('Failed to fetch')} />);
        const error = apiError(500, 'server_error');
        render(<ErrorPageComponent title="Integrations" error={error} />);

        expect(mocks.captureException).toHaveBeenCalledTimes(2);
        expect(mocks.captureException).toHaveBeenLastCalledWith(error, expect.anything());
    });

    it('tags the support id shown to the user', () => {
        const error = apiError(500, 'generic_error_support', 'abc123');
        render(<ErrorPageComponent title="Team Settings" error={error} />);

        expect(container.textContent).toContain('abc123');
        expect(mocks.captureException).toHaveBeenCalledWith(error, {
            tags: { error_page: 'Team Settings', code: 'generic_error_support', status: 500, support_id: 'abc123' }
        });
    });

    it('does not report an expired session', () => {
        render(<ErrorPageComponent title="Integrations" error={apiError(401, 'unauthorized')} />);

        expect(mocks.captureException).not.toHaveBeenCalled();
    });

    it('does not report a not-found page', () => {
        render(<ErrorPageComponent title="Integrations" error={apiError(404, 'not_found')} />);

        expect(container.textContent).toBe('not found');
        expect(mocks.captureException).not.toHaveBeenCalled();
    });
});
