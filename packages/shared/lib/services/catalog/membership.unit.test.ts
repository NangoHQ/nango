import { describe, expect, it } from 'vitest';

import { complementCatalogOverrides, isCatalogActionEnabled } from './membership.js';

describe('isCatalogActionEnabled', () => {
    it('uses the flag when the name is absent from the overlay', () => {
        expect(isCatalogActionEnabled({ name: 'create', autoEnable: true, overrides: {} })).toBe(true);
        expect(isCatalogActionEnabled({ name: 'create', autoEnable: false, overrides: {} })).toBe(false);
        expect(isCatalogActionEnabled({ name: 'create', autoEnable: true, overrides: { delete: false } })).toBe(true);
    });

    it('overlay value wins over the flag', () => {
        expect(isCatalogActionEnabled({ name: 'create', autoEnable: true, overrides: { create: false } })).toBe(false);
        expect(isCatalogActionEnabled({ name: 'create', autoEnable: false, overrides: { create: true } })).toBe(true);
    });

    it('a redundant overlay equal to the flag still resolves to that value', () => {
        expect(isCatalogActionEnabled({ name: 'create', autoEnable: true, overrides: { create: true } })).toBe(true);
        expect(isCatalogActionEnabled({ name: 'create', autoEnable: false, overrides: { create: false } })).toBe(false);
    });
});

describe('complementCatalogOverrides', () => {
    const catalog = ['list', 'create', 'update', 'delete', 'search'];

    it('writes every current catalog name at false when PATCHing true on an empty overlay', () => {
        expect(
            complementCatalogOverrides({
                catalogNames: catalog,
                deployedNames: new Set(),
                previousOverrides: {},
                newFlag: true
            })
        ).toEqual({ list: false, create: false, update: false, delete: false, search: false });
    });

    it('keeps previously overridden names off the map so they follow the new flag', () => {
        expect(
            complementCatalogOverrides({
                catalogNames: catalog,
                deployedNames: new Set(),
                previousOverrides: { delete: false, search: false },
                newFlag: false
            })
        ).toEqual({ list: true, create: true, update: true });
    });

    it('does not write keys for deployed names', () => {
        expect(
            complementCatalogOverrides({
                catalogNames: catalog,
                deployedNames: new Set(['list']),
                previousOverrides: {},
                newFlag: true
            })
        ).toEqual({ create: false, update: false, delete: false, search: false });
    });
});
