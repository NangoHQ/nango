import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';

import { Layout } from '@/components/Layout';
import { triggerClose } from '@/lib/events';
import { I18nProvider } from '@/lib/i18n';
import { useGlobal } from '@/lib/store';
import { expectAccessibleInBothThemes } from '@/test/a11y';

import type * as EventsModule from '@/lib/events';
import type { ConnectUISettings, Theme } from '@nangohq/types';

vi.mock('@/lib/events', async (importActual) => {
    const actual = await importActual<typeof EventsModule>();
    return { ...actual, triggerClose: vi.fn() };
});

function settingsFixture(overrides?: Partial<ConnectUISettings>): ConnectUISettings {
    return {
        defaultTheme: 'light',
        showWatermark: false,
        theme: { light: { primary: '#ff0090' }, dark: { primary: '#ffcc00' } },
        ...overrides
    };
}

async function renderLayout(seed: { theme: Theme | null; settings?: ConnectUISettings }): Promise<HTMLElement> {
    useGlobal.setState({ isEmbedded: false, isAuthLink: false, settings: null, ...seed });

    const rootRoute = createRootRoute({ component: Layout });
    const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <p>Routed view</p> });
    const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]), history: createMemoryHistory({ initialEntries: ['/'] }) });

    const { container } = await render(
        <I18nProvider defaultLanguage="en">
            <RouterProvider router={router} />
        </I18nProvider>
    );
    return container;
}

function dialog(): HTMLElement {
    const element = document.querySelector<HTMLElement>('#connect-ui-dialog');
    if (!element) {
        throw new Error('dialog not rendered');
    }
    return element;
}

function backdrop(): HTMLElement {
    const element = dialog().parentElement;
    if (!element) {
        throw new Error('backdrop not rendered');
    }
    return element;
}

describe('Layout', () => {
    afterEach(() => {
        useGlobal.setState({ theme: null, settings: null });
        document.documentElement.style.removeProperty('--color-primary');
        document.documentElement.style.removeProperty('--color-on-primary');
        vi.mocked(triggerClose).mockClear();
    });

    it('leaves the dialog unpainted while the theme is unknown', async () => {
        const container = await renderLayout({ theme: null });

        await expect.element(page.getByRole('dialog')).toBeInTheDocument();
        expect(getComputedStyle(dialog()).opacity).toBe('0');
        // The backdrop is exempt from the gate: only the dialog waits for the configured theme.
        expect(getComputedStyle(backdrop()).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
        // The focus trap would otherwise drop keyboard and screen reader users into an invisible dialog.
        expect(dialog().contains(document.activeElement)).toBe(false);
        await expectAccessibleInBothThemes(container);
    });

    it('ignores a backdrop click while the dialog is unpainted', async () => {
        await renderLayout({ theme: null });

        await expect.element(page.getByRole('dialog')).toBeInTheDocument();
        backdrop().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

        expect(triggerClose).not.toHaveBeenCalled();
    });

    it('closes on a backdrop click once the dialog is painted', async () => {
        await renderLayout({ theme: 'light', settings: settingsFixture() });

        await expect.element(page.getByRole('dialog')).toBeInTheDocument();
        backdrop().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

        expect(triggerClose).toHaveBeenCalled();
    });

    it('keeps the routed view mounted while the theme is unknown', async () => {
        await renderLayout({ theme: null });

        await expect.element(page.getByText('Routed view')).toBeInTheDocument();
    });

    it('paints the dialog once the theme is known', async () => {
        await renderLayout({ theme: 'light', settings: settingsFixture() });

        await expect.element(page.getByRole('dialog')).toBeInTheDocument();
        expect(getComputedStyle(dialog()).opacity).toBe('1');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        await vi.waitFor(() => expect(document.querySelector('#connect-ui-dialog')?.contains(document.activeElement)).toBe(true));
    });

    it('applies the configured dark theme to the document', async () => {
        await renderLayout({ theme: 'dark', settings: settingsFixture({ defaultTheme: 'dark' }) });

        await expect.element(page.getByRole('dialog')).toBeInTheDocument();
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('applies the configured primary color for the applied theme', async () => {
        await renderLayout({ theme: 'light', settings: settingsFixture() });

        await expect.element(page.getByRole('dialog')).toBeInTheDocument();
        expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#ff0090');
    });

    it('shows the watermark only when the settings enable it', async () => {
        await renderLayout({ theme: 'light', settings: settingsFixture({ showWatermark: true }) });

        await expect.element(page.getByRole('link', { name: /secured by/i })).toBeInTheDocument();
    });
});
