import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthError } from '@nangohq/frontend';

import { useNango } from '@/lib/nango';
import { apiKeyProvider, authResultFixture, expectAccessibleInBothThemes, integrationFixture, renderApp } from '@/test/harness';

import type Nango from '@nangohq/frontend';

vi.mock('@/lib/nango', () => ({ useNango: vi.fn() }));

const auth = vi.fn();
const create = vi.fn();
const clear = vi.fn();

// API_KEY provider + integration are read from the store by Go to build the credentials form.
const seedStore = { provider: apiKeyProvider, integration: integrationFixture };

/** Fill the single API key field and submit, driving Go into its success or error state. */
async function submitCredentials(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await screen.findByRole('heading', { name: 'Link GitHub Account' });
    const apiKeyInput = screen.getByLabelText('API Key', { exact: false });
    await user.type(apiKeyInput, 'secret-key');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
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
            const { container } = renderApp({ route: '/go', seedStore });
            await screen.findByRole('heading', { name: 'Link GitHub Account' });

            await expectAccessibleInBothThemes(container);
        });

        it('is operable by keyboard (type credentials + submit with Enter)', async () => {
            const user = userEvent.setup();
            renderApp({ route: '/go', seedStore });
            await screen.findByRole('heading', { name: 'Link GitHub Account' });

            const apiKeyInput = screen.getByLabelText('API Key', { exact: false });
            apiKeyInput.focus();
            expect(apiKeyInput).toHaveFocus();
            await user.keyboard('secret-key{Enter}');

            await waitFor(() => {
                expect(auth).toHaveBeenCalled();
            });
        });
    });

    describe('success screen', () => {
        async function renderSuccess(): Promise<{ user: ReturnType<typeof userEvent.setup>; container: HTMLElement }> {
            const user = userEvent.setup();
            const { container } = renderApp({ route: '/go', seedStore });
            await submitCredentials(user);
            await screen.findByRole('heading', { name: 'Success!' });
            return { user, container };
        }

        it('has no accessibility violations in light or dark mode', async () => {
            const { container } = await renderSuccess();

            await expectAccessibleInBothThemes(container);
        });

        it('Finish button is keyboard operable', async () => {
            const { user } = await renderSuccess();

            const finish = screen.getByRole('button', { name: 'Finish' });
            finish.focus();
            expect(finish).toHaveFocus();
            // Native button → Enter activates it (triggerClose posts to the parent window; no-op here).
            await user.keyboard('{Enter}');
        });
    });

    describe('error screen', () => {
        async function renderError(): Promise<{ user: ReturnType<typeof userEvent.setup>; container: HTMLElement }> {
            auth.mockRejectedValue(new AuthError('Invalid credentials', 'connection_test_failed'));
            const user = userEvent.setup();
            const { container } = renderApp({ route: '/go', seedStore });
            await submitCredentials(user);
            await screen.findByRole('heading', { name: 'Connection failed' });
            return { user, container };
        }

        it('has no accessibility violations in light or dark mode', async () => {
            const { container } = await renderError();

            await expectAccessibleInBothThemes(container);
        });

        it('error-details toggle and Back button are keyboard operable', async () => {
            const { user } = await renderError();

            const toggle = screen.getByRole('button', { name: 'Show error details' });
            toggle.focus();
            await user.keyboard('{Enter}');
            await screen.findByRole('button', { name: 'Hide error details' });

            const back = screen.getByRole('button', { name: 'Back' });
            back.focus();
            expect(back).toHaveFocus();
            await user.keyboard('{Enter}');

            // Back returns to the credentials form.
            await screen.findByRole('heading', { name: 'Link GitHub Account' });
        });
    });
});
