import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';

import { Layout } from '@/components/Layout';
import { I18nProvider } from '@/lib/i18n';
import { useGlobal } from '@/lib/store';
import { expectAccessibleInBothThemes } from '@/test/a11y';

import type { ConnectUISettings, Theme } from '@nangohq/types';

function settingsFixture(overrides?: Partial<ConnectUISettings>): ConnectUISettings {
    return {
        defaultTheme: 'light',
        showWatermark: false,
        theme: { light: { primary: '#ff0090' }, dark: { primary: '#ffcc00' } },
        ...overrides
    };
}

/** Renders Layout as the root route so the assertions are about the dialog shell, not a view. */
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

function overlay(): HTMLElement {
    const dialog = document.querySelector('#connect-ui-dialog');
    if (!dialog?.parentElement) {
        throw new Error('dialog not rendered');
    }
    return dialog.parentElement;
}

describe('Layout', () => {
    afterEach(() => {
        useGlobal.setState({ theme: null, settings: null });
        document.documentElement.style.removeProperty('--color-primary');
        document.documentElement.style.removeProperty('--color-on-primary');
    });

    it('paints nothing while the theme is unknown', async () => {
        const container = await renderLayout({ theme: null });

        await expect.element(page.getByRole('dialog')).toBeInTheDocument();
        expect(getComputedStyle(overlay()).opacity).toBe('0');
        expect(getComputedStyle(overlay()).backgroundColor).toBe('rgba(0, 0, 0, 0)');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        // The focus trap would otherwise drop keyboard and screen reader users into an invisible dialog.
        expect(document.querySelector('#connect-ui-dialog')?.contains(document.activeElement)).toBe(false);
        await expectAccessibleInBothThemes(container);
    });

    // Guards the deadlock: hide this view and the request that resolves the theme never runs.
    it('keeps the routed view mounted while the theme is unknown', async () => {
        await renderLayout({ theme: null });

        await expect.element(page.getByText('Routed view')).toBeInTheDocument();
    });

    it('paints the dialog once the theme is known', async () => {
        await renderLayout({ theme: 'light', settings: settingsFixture() });

        await expect.element(page.getByRole('dialog')).toBeInTheDocument();
        expect(getComputedStyle(overlay()).opacity).toBe('1');
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
