import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { AuthError } from '@nangohq/frontend';

import { useNango } from '@/lib/nango';
import { expectAccessibleInBothThemes } from '@/test/a11y';
import { apiKeyProvider, authResultFixture, integrationFixture } from '@/test/fixtures';
import { renderApp } from '@/test/render';

import type Nango from '@nangohq/frontend';

vi.mock('@/lib/nango', () => ({ useNango: vi.fn() }));

const auth = vi.fn();
const create = vi.fn();
const clear = vi.fn();

// API_KEY provider + integration are read from the store by Go to build the credentials form.
const seedStore = { provider: apiKeyProvider, integration: integrationFixture };

/** Fill the single API key field and submit, driving Go into its success or error state. */
async function submitCredentials(): Promise<void> {
    await expect.element(page.getByRole('heading', { name: 'Link GitHub Account' })).toBeInTheDocument();
    await userEvent.type(page.getByPlaceholder('Your API Key'), 'secret-key');
    await userEvent.click(page.getByRole('button', { name: 'Connect' }));
}

describe('Go', () => {
    beforeEach(() => {
        auth.mockResolvedValue(authResultFixture);
        create.mockResolvedValue(authResultFixture);
        // The Nango fake only needs the methods Go calls; cast away the rest of the SDK surface.
        vi.mocked(useNango).mockReturnValue({ auth, create, clear } as unknown as Nango);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('credentials form', () => {
        it('has no accessibility violations in light or dark mode', async () => {
            const { container } = await renderApp({ route: '/go', seedStore });
            await expect.element(page.getByRole('heading', { name: 'Link GitHub Account' })).toBeInTheDocument();

            await expectAccessibleInBothThemes(container);
        });

        it('is operable by keyboard (type credentials + submit with Enter)', async () => {
            await renderApp({ route: '/go', seedStore });
            await expect.element(page.getByRole('heading', { name: 'Link GitHub Account' })).toBeInTheDocument();

            const apiKey = page.getByPlaceholder('Your API Key');
            apiKey.element().focus();
            await expect.element(apiKey).toHaveFocus();
            await userEvent.keyboard('secret-key{Enter}');

            await vi.waitFor(() => {
                expect(auth).toHaveBeenCalled();
            });
        });
    });

    describe('success screen', () => {
        async function renderSuccess(): Promise<HTMLElement> {
            const { container } = await renderApp({ route: '/go', seedStore });
            await submitCredentials();
            await expect.element(page.getByRole('heading', { name: 'Success!' })).toBeInTheDocument();
            return container;
        }

        // Skipped pending NAN-6055: the primary button (.bg-primary) fails WCAG AA contrast
        // (white #ffffff on brand #00b2e3 ≈ 2.5:1, needs 4.5:1). It's a design-system token fix;
        // re-enable once https://linear.app/nango/issue/NAN-6055 lands.
        it.skip('has no accessibility violations in light or dark mode', async () => {
            await expectAccessibleInBothThemes(await renderSuccess());
        });

        it('Finish button is keyboard operable', async () => {
            await renderSuccess();

            const finish = page.getByRole('button', { name: 'Finish' });
            finish.element().focus();
            await expect.element(finish).toHaveFocus();
            // Native button → Enter activates it (triggerClose posts to the parent window; no-op here).
            await userEvent.keyboard('{Enter}');
        });
    });

    describe('error screen', () => {
        async function renderError(): Promise<HTMLElement> {
            auth.mockRejectedValue(new AuthError('Invalid credentials', 'connection_test_failed'));
            const { container } = await renderApp({ route: '/go', seedStore });
            await submitCredentials();
            await expect.element(page.getByRole('heading', { name: 'Connection failed' })).toBeInTheDocument();
            return container;
        }

        // Skipped pending NAN-6055: the primary button (.bg-primary) fails WCAG AA contrast
        // (white #ffffff on brand #00b2e3 ≈ 2.5:1, needs 4.5:1). It's a design-system token fix;
        // re-enable once https://linear.app/nango/issue/NAN-6055 lands.
        it.skip('has no accessibility violations in light or dark mode', async () => {
            await expectAccessibleInBothThemes(await renderError());
        });

        it('error-details toggle and Back button are keyboard operable', async () => {
            await renderError();

            const toggle = page.getByRole('button', { name: 'Show error details' });
            toggle.element().focus();
            await userEvent.keyboard('{Enter}');
            await expect.element(page.getByRole('button', { name: 'Hide error details' })).toBeInTheDocument();

            const back = page.getByRole('button', { name: 'Back' });
            back.element().focus();
            await expect.element(back).toHaveFocus();
            await userEvent.keyboard('{Enter}');

            // Back returns to the credentials form.
            await expect.element(page.getByRole('heading', { name: 'Link GitHub Account' })).toBeInTheDocument();
        });
    });
});
