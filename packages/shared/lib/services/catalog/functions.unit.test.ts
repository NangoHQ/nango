import { describe, expect, it } from 'vitest';

import { findCatalogFunctions } from './functions.js';

describe('findCatalogFunctions', () => {
    it('finds a sync', () => {
        expect(findCatalogFunctions({ provider: 'github', name: 'issues' })).toStrictEqual([
            { type: 'sync', name: 'issues', sourceLocation: 'templates-zero/github/syncs/issues.ts' }
        ]);
    });

    it('finds an action', () => {
        expect(findCatalogFunctions({ provider: 'github', name: 'create-issue' })).toStrictEqual([
            { type: 'action', name: 'create-issue', sourceLocation: 'templates-zero/github/actions/create-issue.ts' }
        ]);
    });

    it('returns every type sharing a name, unless a type is given', () => {
        expect(findCatalogFunctions({ provider: 'google-calendar', name: 'settings' }).map((match) => match.type)).toStrictEqual(['sync', 'action']);
        expect(findCatalogFunctions({ provider: 'google-calendar', name: 'settings', type: 'action' })).toStrictEqual([
            { type: 'action', name: 'settings', sourceLocation: 'templates-zero/google-calendar/actions/settings.ts' }
        ]);
    });

    it('resolves aliased providers to the folder they point to', () => {
        expect(findCatalogFunctions({ provider: 'airtable-pat', name: 'bases' })).toStrictEqual([
            { type: 'sync', name: 'bases', sourceLocation: 'templates-zero/airtable/syncs/bases.ts' }
        ]);
    });

    it('returns nothing for unknown providers, functions or types', () => {
        expect(findCatalogFunctions({ provider: 'this-provider-does-not-exist', name: 'issues' })).toStrictEqual([]);
        expect(findCatalogFunctions({ provider: 'github', name: 'this-function-does-not-exist' })).toStrictEqual([]);
        expect(findCatalogFunctions({ provider: 'github', name: 'issues', type: 'action' })).toStrictEqual([]);
    });
});
