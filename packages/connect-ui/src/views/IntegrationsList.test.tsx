import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent as browserUserEvent } from 'vitest/browser';

import { getIntegrations, getProvider } from '@/lib/api';
import { expectAccessibleInBothThemes, integrationsListResponse, providerResponse, renderApp } from '@/test/harness';

// `getIntegrations` feeds the suspense query; `getProvider` is hit when a card is activated.
// Keep `APIError` real so the component's error handling keeps working.
vi.mock('@/lib/api', async (importActual) => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vitest's partial-mock pattern needs the inline module type
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
        const { container } = renderApp({ route: '/integrations' });
        await screen.findByRole('heading', { name: 'Select Integration' });

        await expectAccessibleInBothThemes(container);
    });

    it('integration cards are operable by keyboard (Enter activates)', async () => {
        const user = userEvent.setup();
        renderApp({ route: '/integrations' });
        await screen.findByRole('heading', { name: 'Select Integration' });

        // A role="button" derives its name from content, so match the GitHub card by its label text.
        const card = screen.getByRole('button', { name: /github/i });
        card.focus();
        expect(card).toHaveFocus();

        await user.keyboard('{Enter}');

        // Activating the card must fetch the provider and move toward the auth flow.
        await waitFor(() => {
            expect(getProvider).toHaveBeenCalledWith({ provider: 'github' });
        });
    });

    it('traps keyboard focus within the dialog (cannot Tab out to the page)', async () => {
        renderApp({ route: '/integrations' });
        await screen.findByRole('heading', { name: 'Select Integration' });

        // Use the real browser Tab key (Playwright) so a focus-trap handler is actually honored;
        // @testing-library's tab() moves focus in JS and would bypass it.
        // Tab more times than there are focusable controls — a trapped dialog keeps focus inside,
        // so it must never escape to <body>/<html>.
        for (let i = 0; i < 8; i++) {
            await browserUserEvent.tab();
            expect([document.body, document.documentElement]).not.toContain(document.activeElement);
        }
    });
});
