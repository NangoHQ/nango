import { afterEach, describe, expect, it, vi } from 'vitest';

import { getProviders } from '@nangohq/providers';
import { Ok } from '@nangohq/utils';

import catalogService, { normalizeSearch, rankProviders } from './catalog.service.js';
import providerService from './provider.service.js';

import type { ProviderTemplateConfig } from './provider.service.js';
import type { NangoSyncConfig } from '@nangohq/types';

function candidates(...entries: [name: string, displayName: string][]) {
    return entries.map(([name, displayName]) => ({ name, displayName }));
}

function rankedNames(list: { name: string; displayName: string }[], search: string | undefined): string[] {
    return rankProviders(list, search).map(({ name }) => name);
}

describe('normalizeSearch', () => {
    it('drops case, accents, spaces and punctuation', () => {
        expect(normalizeSearch('Google Calendar')).toBe('googlecalendar');
        expect(normalizeSearch('google_calendar')).toBe('googlecalendar');
        expect(normalizeSearch('Addepar (OAuth)')).toBe('addeparoauth');
        expect(normalizeSearch('Zürich.io')).toBe('zurichio');
    });

    it('returns an empty string when nothing is left', () => {
        expect(normalizeSearch('---')).toBe('');
    });
});

describe('rankProviders', () => {
    const list = candidates(['notion', 'Notion'], ['jira', 'Jira'], ['asana', 'Asana']);

    it('sorts every provider by slug without a search', () => {
        expect(rankedNames(list, undefined)).toStrictEqual(['asana', 'jira', 'notion']);
    });

    it('ranks exact slug, then exact display name, then slug prefix, then display-name prefix, then substring', () => {
        const ranked = candidates(['zeta-contains-acme', 'Zeta'], ['beta', 'Acme Beta'], ['acme-tools', 'Tools'], ['other', 'ACME'], ['acme', 'Something']);

        expect(rankedNames(ranked, 'acme')).toStrictEqual(['acme', 'other', 'acme-tools', 'beta', 'zeta-contains-acme']);
    });

    it('breaks ties by slug', () => {
        const ties = candidates(['zeta-acme', 'Zeta'], ['beta-acme', 'Beta']);

        expect(rankedNames(ties, 'acme')).toStrictEqual(['beta-acme', 'zeta-acme']);
    });

    it('returns nothing when no provider matches', () => {
        expect(rankedNames(list, 'hubspot')).toStrictEqual([]);
    });
});

describe('rankProviders on providers.yaml', () => {
    const providers = getProviders();
    const all = Object.entries(providers ?? {}).map(([name, provider]) => ({ name, displayName: provider.display_name }));

    it.each([
        ['google calendar', 'google-calendar'],
        ['google_calendar', 'google-calendar'],
        ['Microsoft Teams', 'microsoft-teams'],
        ['addepar oauth', 'addepar']
    ])('finds %s', (search, expected) => {
        expect(rankedNames(all, search)[0]).toBe(expected);
    });
});

function legacyFunction(name: string, type: NonNullable<NangoSyncConfig['type']>, description?: string): NangoSyncConfig {
    return { name, type, ...(description !== undefined && { description }), returns: [], endpoints: [], json_schema: null, sdk_version: null, features: [] };
}

function catalogTool(name: string, description: string): ProviderTemplateConfig {
    return {
        name,
        description,
        trigger: { kind: 'http' },
        json_schema: {},
        input_schema_ref: null,
        output_schema_ref: null
    } as unknown as ProviderTemplateConfig;
}

function stubTemplates(...templates: ProviderTemplateConfig[]) {
    vi.spyOn(providerService, 'listTemplates').mockReturnValue(Ok(templates));
}

describe('catalogService functions', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('lists actions, syncs and tools sorted by name, without on-event scripts', () => {
        stubTemplates(
            legacyFunction('list-events', 'sync'),
            legacyFunction('create-event', 'action'),
            catalogTool('delete-event', 'Delete an event'),
            legacyFunction('setup-webhook', 'on-event')
        );

        const result = catalogService.listFunctions({ provider: 'github', type: undefined, search: undefined, page: 0, limit: 20 });

        expect(result.unwrap().functions.map(({ name, type }) => [name, type])).toStrictEqual([
            ['create-event', 'action'],
            ['delete-event', 'tool'],
            ['list-events', 'sync']
        ]);
    });

    it('returns actions and tools for type=tool, and only syncs for type=sync', () => {
        stubTemplates(legacyFunction('create-event', 'action'), catalogTool('delete-event', 'Delete an event'), legacyFunction('list-events', 'sync'));

        const tools = catalogService.listFunctions({ provider: 'github', type: 'tool', search: undefined, page: 0, limit: 20 }).unwrap();
        const syncs = catalogService.listFunctions({ provider: 'github', type: 'sync', search: undefined, page: 0, limit: 20 }).unwrap();

        expect(tools.functions.map(({ name }) => name)).toStrictEqual(['create-event', 'delete-event']);
        expect(syncs.functions.map(({ name }) => name)).toStrictEqual(['list-events']);
    });

    it('searches the normalized name and description', () => {
        stubTemplates(legacyFunction('create-event', 'action'), catalogTool('remove', 'Delete a calendar event'), legacyFunction('list-calendars', 'sync'));

        const byName = catalogService.listFunctions({ provider: 'github', type: undefined, search: 'Create Event', page: 0, limit: 20 }).unwrap();
        const byDescription = catalogService.listFunctions({ provider: 'github', type: undefined, search: 'calendar event', page: 0, limit: 20 }).unwrap();

        expect(byName.functions.map(({ name }) => name)).toStrictEqual(['create-event']);
        expect(byDescription.functions.map(({ name }) => name)).toStrictEqual(['remove']);
    });

    it('returns tools first, then actions, then syncs when several functions share a name', () => {
        stubTemplates(legacyFunction('settings', 'sync'), legacyFunction('settings', 'action'), catalogTool('settings', 'Read settings'));

        expect(catalogService.getFunction({ provider: 'github', name: 'settings', type: undefined }).unwrap().type).toBe('tool');
        expect(catalogService.getFunction({ provider: 'github', name: 'settings', type: 'sync' }).unwrap().type).toBe('sync');

        stubTemplates(legacyFunction('settings', 'sync'), legacyFunction('settings', 'action'));

        expect(catalogService.getFunction({ provider: 'github', name: 'settings', type: undefined }).unwrap().type).toBe('action');
        expect(catalogService.getFunction({ provider: 'github', name: 'settings', type: 'tool' }).unwrap().type).toBe('action');
    });

    it('returns not_found for an unknown provider or function', () => {
        stubTemplates(legacyFunction('create-event', 'action'));

        const unknownProvider = catalogService.listFunctions({ provider: 'constructor', type: undefined, search: undefined, page: 0, limit: 20 });
        const unknownFunction = catalogService.getFunction({ provider: 'github', name: 'create-event', type: 'sync' });

        expect(unknownProvider.isErr() && unknownProvider.error.code).toBe('not_found');
        expect(unknownFunction.isErr() && unknownFunction.error.code).toBe('not_found');
    });
});
