import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { getIntegrations, getProvider } from '@/lib/api';
import { expectAccessibleInBothThemes } from '@/test/a11y';
import { integrationsListResponse, providerResponse } from '@/test/fixtures';
import { renderApp } from '@/test/render';

// `getIntegrations` feeds the suspense query; `getProvider` is hit when a card is activated.
// Keep `APIError` real so the component's error handling keeps working.
vi.mock('@/lib/api', async (importActual) => {
    const actual = await importActual<typeof import('@/lib/api')>();
    return { ...actual, getIntegrations: vi.fn(), getProvider: vi.fn() };
});

describe('IntegrationsList', () => {
    beforeEach(() => {
        vi.mocked(getIntegrations).mockResolvedValue(integrationsListResponse);
        vi.mocked(getProvider).mockResolvedValue(providerResponse);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('has no accessibility violations in light or dark mode', async () => {
        const { container } = await renderApp({ route: '/integrations' });
        await expect.element(page.getByRole('heading', { name: 'Select Integration' })).toBeInTheDocument();

        await expectAccessibleInBothThemes(container);
    });

    it('integration cards are operable by keyboard (Enter activates)', async () => {
        await renderApp({ route: '/integrations' });
        await expect.element(page.getByRole('heading', { name: 'Select Integration' })).toBeInTheDocument();

        // A role="button" derives its name from content, so match the GitHub card by its label text.
        const card = page.getByRole('button', { name: /github/i });
        card.element().focus();
        await expect.element(card).toHaveFocus();

        await userEvent.keyboard('{Enter}');

        // Activating the card must fetch the provider and move toward the auth flow.
        await vi.waitFor(() => {
            expect(getProvider).toHaveBeenCalledWith({ provider: 'github' });
        });
    });

    it('traps keyboard focus within the dialog (cannot Tab out to the page)', async () => {
        await renderApp({ route: '/integrations' });
        await expect.element(page.getByRole('heading', { name: 'Select Integration' })).toBeInTheDocument();

        // Real browser Tab (Playwright) so a focus-trap handler is actually honored.
        // Tab more times than there are focusable controls — a trapped dialog keeps focus inside,
        // so it must never escape to <body>/<html>.
        for (let i = 0; i < 8; i++) {
            await userEvent.tab();
            expect([document.body, document.documentElement]).not.toContain(document.activeElement);
        }
    });
});
