import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { AuthError } from '@nangohq/frontend';

import { triggerClose } from '@/lib/events';
import { useNango } from '@/lib/nango';
import { expectAccessibleInBothThemes } from '@/test/a11y';
import {
    apiKeyProvider,
    authResultFixture,
    dualConfigIntegrationFixture,
    dualConfigIntegrationFixtureNoPreconfig,
    dualConfigProvider,
    integrationFixture,
    salesforceIntegrationFixture,
    salesforceProvider,
    twoStepIntegrationFixture,
    twoStepIntegrationFixtureNoPreconfig,
    twoStepOtherIntegrationFixture,
    twoStepOtherProvider,
    twoStepProvider
} from '@/test/fixtures';
import { renderApp } from '@/test/render';

import type * as EventsModule from '@/lib/events';
import type Nango from '@nangohq/frontend';

vi.mock('@/lib/nango', () => ({ useNango: vi.fn() }));

// Spy `triggerClose` so the Finish test can assert activation directly (it posts to the parent
// frame, which isn't observable from inside Vitest's test iframe). Other exports stay real.
vi.mock('@/lib/events', async (importActual) => {
    const actual = await importActual<typeof EventsModule>();
    return { ...actual, triggerClose: vi.fn() };
});

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
            await userEvent.keyboard('{Enter}');

            // Enter must actually activate Finish, which closes the dialog.
            await vi.waitFor(() => expect(triggerClose).toHaveBeenCalledWith('click:finish'));
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

    describe('preconfigured credentials (integration_config)', () => {
        it('hides a credential field already set at the integration level, but still asks for the rest', async () => {
            await renderApp({ route: '/go', seedStore: { provider: twoStepProvider, integration: twoStepIntegrationFixture } });
            await expect.element(page.getByRole('heading', { name: 'Link Sage Intacct Account' })).toBeInTheDocument();

            await expect.element(page.getByPlaceholder('Username')).toBeInTheDocument();
            expect(page.getByPlaceholder('Client ID').query()).toBeNull();
        });

        it('asks for the field when nothing is preconfigured at the integration level', async () => {
            await renderApp({ route: '/go', seedStore: { provider: twoStepProvider, integration: twoStepIntegrationFixtureNoPreconfig } });
            await expect.element(page.getByRole('heading', { name: 'Link Sage Intacct Account' })).toBeInTheDocument();

            await expect.element(page.getByPlaceholder('Client ID')).toBeInTheDocument();
            await expect.element(page.getByPlaceholder('Username')).toBeInTheDocument();
        });
    });
    describe('preconfigured connection_config', () => {
        it('does not show a connection_config field already set at the integration level', async () => {
            await renderApp({ route: '/go', seedStore: { provider: dualConfigProvider, integration: dualConfigIntegrationFixture } });
            await expect.element(page.getByRole('heading', { name: 'Link Stripe App (Sandbox) Account' })).toBeInTheDocument();

            expect(page.getByPlaceholder('App Domain').query()).toBeNull();
        });

        it('asks for the field when nothing is preconfigured at the integration level', async () => {
            await renderApp({ route: '/go', seedStore: { provider: dualConfigProvider, integration: dualConfigIntegrationFixtureNoPreconfig } });
            await expect.element(page.getByRole('heading', { name: 'Link Stripe App (Sandbox) Account' })).toBeInTheDocument();

            await expect.element(page.getByPlaceholder('App Domain')).toBeInTheDocument();
        });
    });

    describe('cross-provider TWO_STEP schema isolation', () => {
        it('renders Sage Intacct with its own clientId fallback field', async () => {
            await renderApp({ route: '/go', seedStore: { provider: twoStepProvider, integration: twoStepIntegrationFixtureNoPreconfig } });
            await expect.element(page.getByRole('heading', { name: 'Link Sage Intacct Account' })).toBeInTheDocument();
            await expect.element(page.getByPlaceholder('Client ID')).toBeInTheDocument();
        });

        it('does not leak that fallback field into a later, unrelated TWO_STEP provider', async () => {
            await renderApp({ route: '/go', seedStore: { provider: twoStepOtherProvider, integration: twoStepOtherIntegrationFixture } });
            await expect.element(page.getByRole('heading', { name: 'Link Tableau Account' })).toBeInTheDocument();
            await expect.element(page.getByPlaceholder('Personal App Token', { exact: true })).toBeInTheDocument();
            expect(page.getByPlaceholder('Client ID').query()).toBeNull();
        });
    });

    describe('normalize: hostname', () => {
        // `userEvent.paste()` takes no argument and pastes the system clipboard into whatever has focus.
        async function pasteInto(locator: ReturnType<typeof page.getByPlaceholder>, text: string) {
            await userEvent.click(locator);
            await navigator.clipboard.writeText(text);
            await userEvent.paste();
        }

        it('reduces a pasted Instance URL to the bare host the field expects', async () => {
            await renderApp({ route: '/go', seedStore: { provider: salesforceProvider, integration: salesforceIntegrationFixture } });
            await expect.element(page.getByRole('heading', { name: 'Link Salesforce Account' })).toBeInTheDocument();

            const input = page.getByPlaceholder('acme.my.salesforce.com');
            await pasteInto(input, 'https://acme.my.salesforce.com/');

            await expect.element(input).toHaveValue('acme.my.salesforce.com');
            expect(page.getByText('Incorrect Hostname').query()).toBeNull();
        });

        it('submits the bare host, so the prefix is not doubled', async () => {
            await renderApp({ route: '/go', seedStore: { provider: salesforceProvider, integration: salesforceIntegrationFixture } });
            await expect.element(page.getByRole('heading', { name: 'Link Salesforce Account' })).toBeInTheDocument();

            await pasteInto(page.getByPlaceholder('acme.my.salesforce.com'), 'https://acme.my.salesforce.com/');
            await userEvent.click(page.getByRole('button', { name: 'Connect' }));

            await vi.waitFor(() =>
                expect(auth).toHaveBeenCalledWith('salesforce', expect.objectContaining({ params: { hostname: 'acme.my.salesforce.com' } }))
            );
        });

        it('leaves the value alone on a field without the opt-in', async () => {
            const plainProvider = {
                ...salesforceProvider,
                connection_config: { hostname: { ...salesforceProvider.connection_config.hostname, normalize: undefined, pattern: '^.*$' } }
            };
            await renderApp({ route: '/go', seedStore: { provider: plainProvider, integration: salesforceIntegrationFixture } });
            await expect.element(page.getByRole('heading', { name: 'Link Salesforce Account' })).toBeInTheDocument();

            const input = page.getByPlaceholder('acme.my.salesforce.com');
            await pasteInto(input, 'https://acme.my.salesforce.com/');

            await expect.element(input).toHaveValue('https://acme.my.salesforce.com/');
        });
    });
});
