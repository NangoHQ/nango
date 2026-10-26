// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorPageComponent } from './ErrorComponent';
import { RouteErrorPage } from './RouteErrorPage';

import type { Root } from 'react-dom/client';

const mocks = vi.hoisted(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    return { captureException: vi.fn(), captureMessage: vi.fn() };
});

vi.mock('@sentry/react', () => ({ captureException: mocks.captureException, captureMessage: mocks.captureMessage }));
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
        mocks.captureMessage.mockReset();
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

    it('reports when ErrorPageComponent is shown', () => {
        render(<ErrorPageComponent title="Connections" error={{ error: { code: 'server_error' } }} />);

        expect(mocks.captureMessage).toHaveBeenCalledWith('Error page shown', { tags: { error_page: 'Connections', code: 'server_error' } });
    });

    it('does not report a not-found page', () => {
        render(<ErrorPageComponent title="Integrations" error={{ error: { code: 'not_found' } }} />);

        expect(container.textContent).toBe('not found');
        expect(mocks.captureMessage).not.toHaveBeenCalled();
    });
});
