import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';

import { decideInteraction, followOAuthRedirect, OAuthError, readInteraction, resumeOAuthInteraction } from './api';
import { OAuthConsent } from './Consent';
import { OAuthContinue } from './Continue';

import type { OAuthConsentInteraction } from '@nangohq/types';

vi.mock('@/utils/analytics', () => ({ track: vi.fn() }));
vi.mock('@/utils/env', () => ({ globalEnv: { oauthServerUrl: 'https://api.nango.dev', dashboardApiUrl: 'https://api.nango.dev' } }));
vi.mock('./api', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    readInteraction: vi.fn(),
    decideInteraction: vi.fn(),
    followOAuthRedirect: vi.fn(),
    resumeOAuthInteraction: vi.fn()
}));

const uid = 'a'.repeat(32);
const fixture: OAuthConsentInteraction = {
    clientName: 'Example application',
    clientHostname: 'example.com',
    callbackHostname: 'callback.example.com',
    accountName: 'Example account',
    resources: [
        { resource: 'https://mcp.nango.dev/mcp', scopes: ['environment:*'] },
        { resource: 'https://api.nango.dev/agent-sessions/example/mcp', scopes: ['agent-session:*'] }
    ],
    csrfToken: 'c'.repeat(43),
    expiresAt: new Date(Date.now() + 600_000).toISOString()
};

async function renderConsent() {
    return await render(
        <MemoryRouter initialEntries={[`/oauth/consent/${uid}`]}>
            <Routes>
                <Route path="/oauth/consent/:uid" element={<OAuthConsent />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('OAuth consent browser experience', () => {
    beforeEach(async () => {
        vi.resetAllMocks();
        vi.mocked(readInteraction).mockResolvedValue({ data: { ...fixture, expiresAt: new Date(Date.now() + 600_000).toISOString() } });
        vi.mocked(decideInteraction).mockResolvedValue({ data: { redirectUrl: `https://api.nango.dev/oauth/authorize/${uid}`, grantId: 'product-id' } });
        await page.viewport(1440, 1000);
    });

    it('shows all resources and unverified identity, and supports keyboard approval', async () => {
        const { container } = await renderConsent();
        await expect.element(page.getByRole('heading', { name: 'Authorize access' })).toBeInTheDocument();
        for (const resource of fixture.resources) await expect.element(page.getByRole('heading', { name: resource.resource })).toBeInTheDocument();
        await expect.element(page.getByText(/Nango has not verified its identity/)).toBeInTheDocument();
        await expect.element(page.getByText(/New environments and role promotions may expand access/)).toBeInTheDocument();
        expect(container.querySelector('select')).toBeNull();
        for (const theme of ['light', 'dark']) {
            document.documentElement.setAttribute('data-theme', theme);
            const results = await axe.run(container);
            expect(results.violations).toEqual([]);
        }
        document.documentElement.removeAttribute('data-theme');
        page.getByRole('button', { name: 'Deny' }).element().focus();
        await userEvent.tab();
        await expect.element(page.getByRole('button', { name: 'Approve access' })).toHaveFocus();
        await userEvent.keyboard('{Enter}');
        await vi.waitFor(() => expect(decideInteraction).toHaveBeenCalledWith(uid, fixture.csrfToken, true));
        expect(followOAuthRedirect).toHaveBeenCalled();
    });

    it('fits a narrow mobile viewport with long untrusted metadata', async () => {
        await page.viewport(375, 812);
        vi.mocked(readInteraction).mockResolvedValue({
            data: { ...fixture, clientName: 'VeryLongClientName'.repeat(7), accountName: 'LongAccountName'.repeat(8) }
        });
        const { container } = await renderConsent();
        await expect.element(page.getByRole('button', { name: 'Approve access' })).toBeVisible();
        expect(container.scrollWidth).toBeLessThanOrEqual(375);
        await page.getByRole('button', { name: 'Deny' }).click();
        expect(decideInteraction).toHaveBeenCalledWith(uid, fixture.csrfToken, false);
    });

    it('exposes loading state and disables both actions during a single submission', async () => {
        let resolveRead!: (value: { data: OAuthConsentInteraction }) => void;
        vi.mocked(readInteraction).mockReturnValue(
            new Promise((resolve) => {
                resolveRead = resolve;
            })
        );
        await renderConsent();
        await expect.element(page.getByRole('status')).toHaveTextContent('Loading authorization request');
        resolveRead({ data: fixture });
        await expect.element(page.getByRole('button', { name: 'Approve access' })).toBeVisible();
        vi.mocked(decideInteraction).mockReturnValue(new Promise(() => {}));
        const button = page.getByRole('button', { name: 'Approve access' });
        (button.element() as HTMLButtonElement).click();
        (button.element() as HTMLButtonElement).click();
        await expect.element(button).toBeDisabled();
        await expect.element(page.getByRole('button', { name: 'Deny' })).toBeDisabled();
        expect(decideInteraction).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['interaction_expired', 'Request expired'],
        ['interaction_completed', 'Request already completed'],
        ['unauthorized', 'Authorization unavailable'],
        ['feature_disabled', 'Authorization unavailable']
    ])('renders %s without exposing API details', async (code, title) => {
        vi.mocked(readInteraction).mockRejectedValue(new OAuthError(code!));
        await renderConsent();
        await expect.element(page.getByRole('heading', { name: title! })).toBeInTheDocument();
        expect(page.getByRole('button', { name: 'Approve access' }).query()).toBeNull();
    });

    it('expires an open consent page without allowing stale approval', async () => {
        vi.mocked(readInteraction).mockResolvedValue({ data: { ...fixture, expiresAt: new Date(Date.now() + 100).toISOString() } });
        await renderConsent();
        await expect.element(page.getByRole('heading', { name: 'Request expired' })).toBeInTheDocument();
    });

    it('recovers from API failure by re-reading the interaction before offering approval', async () => {
        vi.mocked(readInteraction).mockRejectedValueOnce(new Error('sensitive-url-must-not-be-shown'));
        const { container } = await renderConsent();
        await expect.element(page.getByRole('button', { name: 'Try again' })).toBeVisible();
        expect(container.textContent).not.toContain('sensitive-url');
        await page.getByRole('button', { name: 'Try again' }).click();
        await expect.element(page.getByRole('button', { name: 'Approve access' })).toBeVisible();
        expect(readInteraction).toHaveBeenCalledTimes(2);
    });

    it('resumes the interaction after login under React StrictMode without a handoff API call', async () => {
        await render(
            <StrictMode>
                <MemoryRouter initialEntries={[`/oauth/continue/${uid}`]}>
                    <Routes>
                        <Route path="/oauth/continue/:uid" element={<OAuthContinue />} />
                    </Routes>
                </MemoryRouter>
            </StrictMode>
        );
        await vi.waitFor(() => expect(resumeOAuthInteraction).toHaveBeenCalledWith(uid));
        expect(readInteraction).not.toHaveBeenCalled();
        expect(decideInteraction).not.toHaveBeenCalled();
    });
});
