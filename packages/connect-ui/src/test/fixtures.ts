import type { AuthResult } from '@nangohq/frontend';
import type { ApiPublicIntegration, GetPublicIntegration, GetPublicListIntegrations, GetPublicProvider } from '@nangohq/types';

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
