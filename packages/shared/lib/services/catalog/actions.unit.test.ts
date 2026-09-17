import { describe, expect, it } from 'vitest';

import {
    catalogActionJsPath,
    catalogActionTsPath,
    complementCatalogOverrides,
    getCatalogAction,
    isCatalogActionEnabled,
    isTemplatesZeroPath,
    listCatalogActions
} from './actions.js';

describe('catalog actions reader', () => {
    it('returns github create-issue from flows.zero.json', () => {
        const action = getCatalogAction('github', 'create-issue');
        expect(action).toBeDefined();
        expect(action?.name).toBe('create-issue');
        expect(action?.output.length).toBeGreaterThan(0);
        expect(action?.sdk_version.endsWith('-zero')).toBe(true);
    });

    it('lists catalog actions for a provider and omits unknown providers', () => {
        const github = listCatalogActions('github');
        expect(github.some((action) => action.name === 'create-issue')).toBe(true);
        expect(listCatalogActions('this-provider-does-not-exist')).toEqual([]);
    });

    it('builds templates-zero paths', () => {
        expect(catalogActionJsPath({ provider: 'github', name: 'create-issue' })).toBe('templates-zero/github/build/github_actions_create-issue.cjs');
        expect(catalogActionTsPath({ provider: 'github', name: 'create-issue' })).toBe('templates-zero/github/actions/create-issue.ts');
        expect(isTemplatesZeroPath('templates-zero/github/build/github_actions_create-issue.cjs')).toBe(true);
        expect(isTemplatesZeroPath('account/1/environment/1/config/2/create-issue-v1.js')).toBe(false);
    });
});

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
