// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GetInstallation } from '@nangohq/types';
import type { Root } from 'react-dom/client';

const mocks = vi.hoisted(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    return {
        scopes: new Set<string>(),
        query: { data: undefined as GetInstallation['Success'] | undefined, error: null as unknown, isLoading: false },
        enabled: [] as boolean[]
    };
});

vi.mock('@/hooks/useInstallation', () => ({
    useInstallation: ({ enabled }: { enabled: boolean }) => {
        mocks.enabled.push(enabled);
        return mocks.query;
    }
}));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ can: (scope: string) => mocks.scopes.has(scope) }) }));
vi.mock('@/components/patterns/ErrorComponent', () => ({ ErrorPageComponent: () => <p>generic error page</p> }));
vi.mock('@/layout/DashboardLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('react-helmet', () => ({ Helmet: () => null }));

const installation: GetInstallation['Success'] = {
    data: {
        version: '0.72.6',
        managedVersion: '1.7.3',
        commit: null,
        license: {
            status: 'valid',
            license: {
                version: 1,
                installation_id: '9c1c7b6e-2f8a-4d3e-b0a1-5e6f7a8b9c0d',
                name: 'acme/prod',
                issued_at: '2026-11-01T00:00:00.000Z',
                expires_at: '2027-11-01T00:00:00.000Z',
                grace_until: '2028-02-01T00:00:00.000Z',
                telemetry: true
            }
        }
    }
};

describe('InstallationShow', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        mocks.scopes.clear();
        mocks.enabled.length = 0;
        mocks.query = { data: undefined, error: null, isLoading: false };
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    // globalEnv snapshots window._env when its module loads, so each case imports the page afresh.
    async function render({ isManaged }: { isManaged: boolean }) {
        vi.stubGlobal('_env', { apiUrl: 'http://localhost:3003', dashboardApiUrl: 'http://localhost:3003', isManaged });
        const { InstallationShow } = await import('./Show');
        await act(async () => {
            root.render(<InstallationShow />);
            await Promise.resolve();
        });
    }

    it('tells an unmanaged build apart without requesting anything', async () => {
        mocks.scopes.add('account:installation:read');
        await render({ isManaged: false });
        expect(container.textContent).toContain('Not a managed release');
        expect(mocks.enabled).toEqual([false]);
    });

    it('denies a role without the scope without requesting anything', async () => {
        await render({ isManaged: true });
        expect(container.textContent).toContain('Access denied');
        expect(container.textContent).not.toContain('generic error page');
        expect(mocks.enabled).toEqual([false]);
    });

    it('shows the license when the build is managed and the role has the scope', async () => {
        mocks.scopes.add('account:installation:read');
        mocks.query = { data: installation, error: null, isLoading: false };
        await render({ isManaged: true });
        expect(mocks.enabled).toEqual([true]);
        expect(container.textContent).toContain('1.7.3');
        expect(container.textContent).toContain('acme/prod');
        expect(container.textContent).toContain('Nov 1, 2027');
    });
});
