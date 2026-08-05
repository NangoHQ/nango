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

// TWO_STEP provider with a `clientId` declared only in `integration_config` — it doubles as a per-connection
// credential fallback (see Go.tsx), asked from the end user only when the integration hasn't preconfigured it.
export const twoStepProvider = {
    auth_mode: 'TWO_STEP',
    display_name: 'Sage Intacct',
    docs: 'https://docs.example.com/sage-intacct',
    name: 'sage-intacct-cc',
    logo_url: 'https://app.nango.dev/images/template-logos/sage-intacct-cc.svg',
    token_response: { token: 'access_token' },
    credentials: {
        username: { type: 'string', title: 'Username', description: 'Username', automated: false, order: 2 }
    },
    integration_config: {
        clientId: { type: 'string', title: 'Client ID', description: 'Client ID', automated: false, optional: true, order: 1 }
    }
} satisfies GetPublicProvider['Success']['data'];

export const twoStepIntegrationFixture: GetPublicIntegration['Success']['data'] = {
    ...integrationFixture,
    unique_key: 'sage-intacct-cc',
    provider: 'sage-intacct-cc',
    display_name: 'Sage Intacct',
    preconfigured_credentials: ['clientId']
};

// Same integration, but with nothing preconfigured — used to assert the field renders by default.
export const twoStepIntegrationFixtureNoPreconfig: GetPublicIntegration['Success']['data'] = {
    ...twoStepIntegrationFixture,
    preconfigured_credentials: undefined
};

export const twoStepOtherProvider = {
    auth_mode: 'TWO_STEP',
    display_name: 'Tableau',
    docs: 'https://docs.example.com/tableau',
    name: 'tableau',
    logo_url: 'https://app.nango.dev/images/template-logos/tableau.svg',
    token_response: { token: 'access_token' },
    credentials: {
        pat_name: { type: 'string', title: 'Personal App Token', description: 'PAT name', automated: false, order: 1 },
        pat_secret: { type: 'string', title: 'Personal App Token Secret', description: 'PAT secret', automated: false, order: 2 }
    }
} satisfies GetPublicProvider['Success']['data'];

export const twoStepOtherIntegrationFixture: GetPublicIntegration['Success']['data'] = {
    ...integrationFixture,
    unique_key: 'tableau',
    provider: 'tableau',
    display_name: 'Tableau',
    preconfigured_credentials: undefined
};

export const authResultFixture = {
    providerConfigKey: 'github',
    connectionId: 'conn_test_123'
} satisfies AuthResult;
