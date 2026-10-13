// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, Component } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError } from '../utils/api';
import { metaQueryKey, useMeta } from './useMeta';

import type { Root } from 'react-dom/client';

const mocks = vi.hoisted(() => {
    vi.stubGlobal('_env', { apiUrl: 'http://localhost:3003', dashboardApiUrl: 'http://localhost:3003' });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    return { fetchMeta: vi.fn<() => Promise<Response>>() };
});

vi.mock('../utils/api', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    apiFetch: () => mocks.fetchMeta()
}));

class Boundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
    override state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    override render() {
        return this.state.failed ? <p>boundary</p> : this.props.children;
    }
}

function Meta() {
    const { data, error } = useMeta();
    if (data) {
        return <p>meta</p>;
    }
    return <p>{error ? 'error' : 'loading'}</p>;
}

const meta = { data: { environments: [], baseUrl: '', debugMode: false } };

function jsonResponse(status: number, body: unknown) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('useMeta', () => {
    let container: HTMLDivElement;
    let root: Root;
    let queryClient: QueryClient;

    beforeEach(() => {
        mocks.fetchMeta.mockReset();
        queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.restoreAllMocks();
    });

    async function render() {
        act(() => {
            root.render(
                <QueryClientProvider client={queryClient}>
                    <Boundary>
                        <Meta />
                    </Boundary>
                </QueryClientProvider>
            );
        });
        await settle();
    }

    async function settle() {
        for (let tick = 0; tick < 20 && container.textContent === 'loading'; tick++) {
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
            });
        }
    }

    it('throws to the error boundary when meta never loaded', async () => {
        mocks.fetchMeta.mockRejectedValue(new TypeError('Failed to fetch'));

        await render();

        expect(container.textContent).toBe('boundary');
    });

    it('keeps the cached meta when a refetch fails', async () => {
        queryClient.setQueryData(metaQueryKey, meta);
        mocks.fetchMeta.mockRejectedValue(new TypeError('Failed to fetch'));

        await render();
        await act(async () => {
            await queryClient.refetchQueries({ queryKey: metaQueryKey });
        });

        expect(container.textContent).toBe('meta');
    });

    it('leaves a no-session error to the sign-out handler', async () => {
        mocks.fetchMeta.mockResolvedValue(jsonResponse(401, { error: { code: 'unauthorized' } }));

        await render();

        expect(container.textContent).toBe('error');
        expect(queryClient.getQueryState(metaQueryKey)?.error).toBeInstanceOf(APIError);
    });
});
