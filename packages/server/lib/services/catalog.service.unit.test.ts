import { describe, expect, it } from 'vitest';

import { getProviders } from '@nangohq/providers';

import { normalizeSearch, rankProviders } from './catalog.service.js';

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
