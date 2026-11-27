import { describe, expect, it } from 'vitest';

import { typesOptions } from './constants';
import { withoutAll } from './filters';
import { groupState, toggleGroup, toggleSubtype, typeLabel } from './typeFilter';

import type { TypeOption } from './constants';

function group(value: string): TypeOption {
    const option = typesOptions.find((o) => o.value === value);
    if (!option) {
        throw new Error(`No type ${value}`);
    }
    return option;
}

const sync = group('sync');
const auth = group('auth');

describe('groupState', () => {
    it('reads the type, a subtype, or nothing', () => {
        expect(groupState(['sync'], sync)).toBe('all');
        expect(groupState(['sync:run'], sync)).toBe('partial');
        expect(groupState(['proxy'], sync)).toBe('none');
    });
});

describe('toggleGroup', () => {
    it('selects the whole type and drops its subtypes', () => {
        expect(toggleGroup(['proxy', 'sync:run', 'sync:init'], sync)).toEqual(['proxy', 'sync']);
    });

    it('deselects a fully selected type', () => {
        expect(toggleGroup(['sync', 'proxy'], sync)).toEqual(['proxy']);
    });
});

describe('toggleSubtype', () => {
    it('adds and removes a subtype', () => {
        expect(toggleSubtype([], sync, 'sync:run')).toEqual(['sync:run']);
        expect(toggleSubtype(['sync:run'], sync, 'sync:run')).toEqual([]);
    });

    it('folds every subtype into the type', () => {
        expect(toggleSubtype(['proxy', 'auth:create_connection'], auth, 'auth:refresh_token')).toEqual(['proxy', 'auth']);
    });

    it('keeps the siblings when one subtype leaves a full type', () => {
        expect(toggleSubtype(['auth'], auth, 'auth:refresh_token')).toEqual(['auth:create_connection']);
    });
});

describe('typeLabel', () => {
    it('names a type or a subtype under its type', () => {
        expect(typeLabel('sync', typesOptions)).toBe('Sync');
        expect(typeLabel('sync:run', typesOptions)).toBe('Sync run');
    });
});

describe('withoutAll', () => {
    it('drops the old explicit all, alone or next to values', () => {
        expect(withoutAll(['all'])).toEqual([]);
        expect(withoutAll(['all', 'failed'])).toEqual(['failed']);
        expect(withoutAll([])).toEqual([]);
    });
});
