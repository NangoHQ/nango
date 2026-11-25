// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Root } from 'react-dom/client';

const mocks = vi.hoisted(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    return { scopes: new Set<string>() };
});

const passThrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
vi.mock('@/components/ui/DropdownMenu', () => ({
    DropdownMenu: passThrough,
    DropdownMenuContent: passThrough,
    DropdownMenuItem: passThrough,
    DropdownMenuSeparator: () => null,
    DropdownMenuTrigger: passThrough
}));
vi.mock('@/features/DevToolPanel', () => ({ useDevPanelStore: () => vi.fn(), useIsDevToolsEnabled: () => false }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: () => ({ data: { data: { auditTrail: false, gettingStartedDismissed: false } } }) }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ can: (scope: string) => mocks.scopes.has(scope) }) }));
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: { name: 'Test User', email: 'test@nango.dev' } }) }));
vi.mock('@/store', () => ({ useStore: (selector: (state: Record<string, unknown>) => unknown) => selector({ showGettingStarted: false }) }));
vi.mock('@/utils/analytics', () => ({ track: vi.fn() }));
vi.mock('@/utils/user', () => ({ useSignout: () => vi.fn() }));
vi.mock('./ThemeSwitcher', () => ({ ThemeSwitcher: () => null }));

describe('ProfileDropdown', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        mocks.scopes.clear();
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

    // globalEnv snapshots window._env when its module loads, so each case imports the component afresh.
    async function render({ isManaged }: { isManaged: boolean }) {
        vi.stubGlobal('_env', { apiUrl: 'http://localhost:3003', dashboardApiUrl: 'http://localhost:3003', isManaged, features: { plan: false } });
        const { ProfileDropdown } = await import('./ProfileDropdown');
        await act(async () => {
            root.render(
                <MemoryRouter>
                    <ProfileDropdown />
                </MemoryRouter>
            );
            await Promise.resolve();
        });
    }

    it.each([
        { isManaged: true, scope: true, shown: true },
        { isManaged: true, scope: false, shown: false },
        { isManaged: false, scope: true, shown: false },
        { isManaged: false, scope: false, shown: false }
    ])('isManaged $isManaged with the scope $scope shows Installation info: $shown', async ({ isManaged, scope, shown }) => {
        if (scope) {
            mocks.scopes.add('account:installation:read');
        }
        await render({ isManaged });
        expect(container.textContent?.includes('Installation info')).toBe(shown);
        expect(container.textContent).toContain('Team');
    });
});
