// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { usePathNavigation } from './usePathNavigation';

import type { Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Tab({ basePath }: { basePath: string }) {
    const [value] = usePathNavigation(basePath, 'settings');
    return <p>{value}</p>;
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function renderAt(url: string, basePath: string): string | null | undefined {
    container = document.createElement('div');
    root = createRoot(container);
    act(() => {
        root?.render(
            <MemoryRouter initialEntries={[url]}>
                <Tab basePath={basePath} />
            </MemoryRouter>
        );
    });
    return container.textContent;
}

afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    container = undefined;
});

describe('usePathNavigation', () => {
    it('returns the default tab on the base path', () => {
        expect(renderAt('/dev/integrations/github', '/dev/integrations/github')).toBe('settings');
    });

    it('returns the tab from the last segment', () => {
        expect(renderAt('/dev/integrations/github/functions', '/dev/integrations/github')).toBe('functions');
    });

    it('returns the default tab for a key with a space', () => {
        expect(renderAt('/dev/integrations/my%20key', '/dev/integrations/my key')).toBe('settings');
    });
});
