import { describe, expect, it } from 'vitest';

import {
    countIntegrationsByProvider,
    filterProviders,
    formatFunctionCounts,
    getCardMeta,
    getCategoryLabel,
    getInitials,
    getInstantSetup,
    getOneClickSetupBody,
    listCategories,
    sortProviders
} from './catalog.utils';

import type { ApiProviderListItem } from '@nangohq/types';

function provider(overrides: Partial<ApiProviderListItem> & Pick<ApiProviderListItem, 'name'>): ApiProviderListItem {
    return {
        displayName: overrides.name,
        authMode: 'OAUTH2',
        docs: '',
        preConfigured: false,
        preConfiguredScopes: [],
        functionCounts: { tools: 0, syncs: 0 },
        ...overrides
    };
}

describe('getInstantSetup', () => {
    it('is managed when Nango has preconfigured credentials, even for OAuth 2', () => {
        expect(getInstantSetup(provider({ name: 'hubspot', authMode: 'OAUTH2', preConfigured: true }))).toBe('managed');
    });

    it.each(['OAUTH1', 'OAUTH2', 'APP', 'CUSTOM'] as const)('is not instant for %s without preconfigured credentials', (authMode) => {
        expect(getInstantSetup(provider({ name: 'x', authMode }))).toBeNull();
    });

    it.each(['API_KEY', 'BASIC', 'OAUTH2_CC', 'JWT', 'TBA', 'NONE'] as const)('needs no developer app for %s', (authMode) => {
        expect(getInstantSetup(provider({ name: 'x', authMode }))).toBe('no-dev-app');
    });

    it('is not instant for MCP OAuth with a static client', () => {
        expect(getInstantSetup(provider({ name: 'x', authMode: 'MCP_OAUTH2', clientRegistration: 'static' }))).toBeNull();
        expect(getInstantSetup(provider({ name: 'x', authMode: 'MCP_OAUTH2', clientRegistration: 'dynamic' }))).toBe('no-dev-app');
    });
});

describe('getOneClickSetupBody', () => {
    it('uses Nango’s credentials when the provider is managed', () => {
        expect(getOneClickSetupBody(provider({ name: 'hubspot', preConfigured: true }))).toEqual({ provider: 'hubspot', useSharedCredentials: true });
    });

    it.each(['API_KEY', 'BASIC', 'OAUTH2_CC', 'JWT', 'NONE'] as const)('creates a %s integration without credentials', (authMode) => {
        expect(getOneClickSetupBody(provider({ name: 'x', authMode }))).toEqual({ provider: 'x', useSharedCredentials: false });
    });

    it.each(['MCP_OAUTH2', 'MCP_OAUTH2_GENERIC'] as const)('creates a %s integration with default auth settings', (authMode) => {
        expect(getOneClickSetupBody(provider({ name: 'x', authMode }))).toEqual({ provider: 'x', useSharedCredentials: false, auth: { authType: authMode } });
    });

    it('needs the setup form for MCP servers that require your own client', () => {
        expect(getOneClickSetupBody(provider({ name: 'x', authMode: 'MCP_OAUTH2', clientRegistration: 'static' }))).toBeNull();
    });

    it.each(['OAUTH2', 'TBA', 'INSTALL_PLUGIN'] as const)('needs the setup form for %s', (authMode) => {
        expect(getOneClickSetupBody(provider({ name: 'x', authMode }))).toBeNull();
    });

    it('needs the setup form when a managed provider has integration config', () => {
        expect(
            getOneClickSetupBody(
                provider({
                    name: 'x',
                    preConfigured: true,
                    integration_config: { region: { type: 'string', title: 'Region', description: '', order: 0, automated: false } }
                })
            )
        ).toBeNull();
    });

    it('needs the setup form when the provider has integration config', () => {
        expect(
            getOneClickSetupBody(
                provider({
                    name: 'x',
                    authMode: 'API_KEY',
                    integration_config: { region: { type: 'string', title: 'Region', description: '', order: 0, automated: false } }
                })
            )
        ).toBeNull();
    });
});

describe('countIntegrationsByProvider', () => {
    it('counts every integration of the same provider', () => {
        const counts = countIntegrationsByProvider([{ provider: 'github' }, { provider: 'github' }, { provider: 'slack' }]);
        expect(counts.get('github')).toBe(2);
        expect(counts.get('slack')).toBe(1);
        expect(counts.get('linear')).toBeUndefined();
    });
});

describe('sortProviders', () => {
    const providers = [
        provider({ name: 'zendesk', displayName: 'Zendesk', categories: ['support', 'popular'] }),
        provider({ name: '3cx', displayName: '3CX' }),
        provider({ name: 'airtable', displayName: 'Airtable', categories: ['popular'] }),
        provider({ name: 'acuity', displayName: 'acuity Scheduling' })
    ];

    it('puts popular providers first, each group A–Z', () => {
        expect(sortProviders(providers, 'popular').map((p) => p.name)).toEqual(['airtable', 'zendesk', '3cx', 'acuity']);
    });

    it('sorts everything A–Z, ignoring case', () => {
        expect(sortProviders(providers, 'alphabetical').map((p) => p.name)).toEqual(['3cx', 'acuity', 'airtable', 'zendesk']);
    });
});

describe('filterProviders', () => {
    const providers = [
        provider({ name: 'github', authMode: 'OAUTH2', categories: ['dev-tools'] }),
        provider({ name: 'gitlab', authMode: 'API_KEY', categories: ['dev-tools'] }),
        provider({ name: 'stripe', authMode: 'API_KEY', categories: ['payment'] })
    ];

    it('combines category and instant filters', () => {
        expect(filterProviders(providers, { category: 'dev-tools', instantOnly: true }).map((p) => p.name)).toEqual(['gitlab']);
    });

    it('keeps everything without filters', () => {
        expect(filterProviders(providers, { category: null, instantOnly: false })).toHaveLength(3);
    });
});

describe('listCategories', () => {
    it('counts categories, hides popular, and sorts by label', () => {
        const categories = listCategories([{ categories: ['popular', 'crm', 'accounting'] }, { categories: ['crm'] }, {}]);
        expect(categories).toEqual([
            { slug: 'accounting', label: 'Accounting', count: 1 },
            { slug: 'crm', label: 'CRM', count: 2 }
        ]);
    });
});

describe('getCategoryLabel', () => {
    it('uses the known label, or capitalizes each word', () => {
        expect(getCategoryLabel('dev-tools')).toBe('Dev Tools');
        expect(getCategoryLabel('ats')).toBe('ATS');
        expect(getCategoryLabel('new-thing')).toBe('New Thing');
    });
});

describe('formatFunctionCounts', () => {
    it('leaves out zero parts and pluralizes', () => {
        expect(formatFunctionCounts({ tools: 32, syncs: 5 })).toBe('32 tools · 5 syncs');
        expect(formatFunctionCounts({ tools: 1, syncs: 0 })).toBe('1 tool');
        expect(formatFunctionCounts({ tools: 0, syncs: 2 })).toBe('2 syncs');
        expect(formatFunctionCounts({ tools: 0, syncs: 0 })).toBeNull();
    });
});

describe('getCardMeta', () => {
    it('shows function counts, never categories', () => {
        expect(getCardMeta({ functionCounts: { tools: 3, syncs: 1 }, categories: ['crm'] })).toBe('3 tools · 1 sync');
        expect(getCardMeta({ functionCounts: { tools: 0, syncs: 0 }, categories: ['popular', 'crm', 'dev-tools'] })).toBe('No pre-built tools yet');
        expect(getCardMeta({ functionCounts: { tools: 0, syncs: 0 }, categories: ['productivity', 'mcp'] })).toBe('All MCP tools');
    });
});

describe('getInitials', () => {
    it('uses the first letters of the first two words, ignoring qualifiers in parentheses', () => {
        expect(getInitials('Acuity Scheduling')).toBe('AS');
        expect(getInitials('ActiveCampaign')).toBe('AC');
        expect(getInitials('Addepar (Basic Auth)')).toBe('AD');
    });
});
