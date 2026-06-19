import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import { expect } from 'vitest';

import { I18nProvider } from '@/lib/i18n';
import { routeTree } from '@/lib/routes';
import { useGlobal } from '@/lib/store';

import type { AuthResult } from '@nangohq/frontend';
import type { ApiPublicIntegration, GetPublicIntegration, GetPublicListIntegrations, GetPublicProvider } from '@nangohq/types';
import type { RenderResult } from '@testing-library/react';

type StorePatch = Partial<ReturnType<typeof useGlobal.getState>>;

/**
 * Renders the real app shell (Layout dialog + providers) at a given route, mirroring App.tsx
 * but with an isolated in-memory router and query client per test so nothing leaks between tests.
 * Seed `useGlobal` via `seedStore` before render to drive views that read provider/integration/session.
 */
export function renderApp({ route, seedStore }: { route: string; seedStore?: StorePatch }): RenderResult {
    if (seedStore) {
        useGlobal.setState(seedStore);
    }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [route] }) });

    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider defaultLanguage="en">
                <RouterProvider router={router} />
            </I18nProvider>
        </QueryClientProvider>
    );
}

// WCAG 2.2 AA scope (the standard NAN-5901/5906 target), including the 2.1/2.2 additions.
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Runs axe over `element` and asserts zero violations, with a concise rule summary on failure. */
async function expectNoAxeViolations(element: HTMLElement, label: string): Promise<void> {
    const results = await axe.run(element, { runOnly: { type: 'tag', values: WCAG_AA_TAGS } });
    const summary = results.violations.map((v) => `[${v.id}] ${v.help} — ${v.nodes.map((n) => n.target.map(String).join(' ')).join(' | ')}`);
    expect(summary, `axe violations (${label})`).toEqual([]);
}

/**
 * Scans `element` for accessibility violations in BOTH light and dark themes (the redesign ships
 * both). Real CSS is required for color-contrast checks, which is why these run in Browser Mode.
 */
export async function expectAccessibleInBothThemes(element: HTMLElement): Promise<void> {
    for (const theme of ['light', 'dark'] as const) {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        await expectNoAxeViolations(element, `${theme} theme`);
    }
    document.documentElement.classList.remove('dark');
}

/*****************
 * Fixtures
 *****************/

const TIMESTAMP = '2026-01-01T00:00:00.000Z';

export const integrationFixtures = [
    {
        unique_key: 'github',
        provider: 'github',
        display_name: 'GitHub',
        forward_webhooks: false,
        logo: 'https://app.nango.dev/images/template-logos/github.svg',
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP
    },
    {
        unique_key: 'slack',
        provider: 'slack',
        display_name: 'Slack',
        forward_webhooks: false,
        logo: 'https://app.nango.dev/images/template-logos/slack.svg',
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP
    }
] satisfies ApiPublicIntegration[];

export const integrationsListResponse = { data: integrationFixtures } satisfies GetPublicListIntegrations['Success'];

export const integrationFixture: GetPublicIntegration['Success']['data'] = integrationFixtures[0];

// API_KEY provider with docs_connect set, so the auth form renders its credential field (and the
// per-field documentation icon-link) — the surface NAN-5906 #6 (icon links without a name) lives on.
export const apiKeyProvider = {
    auth_mode: 'API_KEY',
    display_name: 'GitHub',
    docs: 'https://docs.example.com/github',
    docs_connect: 'https://docs.example.com/github/connect',
    name: 'github',
    logo_url: 'https://app.nango.dev/images/template-logos/github.svg'
} satisfies GetPublicProvider['Success']['data'];

export const providerResponse = { data: apiKeyProvider } satisfies GetPublicProvider['Success'];

export const authResultFixture = {
    providerConfigKey: 'github',
    connectionId: 'conn_test_123'
} satisfies AuthResult;
