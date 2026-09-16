import { describe, expect, it } from 'vitest';

import { catalogActionJsPath, catalogActionTsPath, getCatalogAction, isTemplatesZeroPath, listCatalogActions } from './actions.js';

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
