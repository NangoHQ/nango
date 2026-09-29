import { describe, expect, it } from 'vitest';

import { getCatalogTool, isTemplatesZeroPath, listCatalogTools } from './actions.js';

describe('catalog tools reader', () => {
    it('returns github create-issue from flows.zero.json', () => {
        const tool = getCatalogTool('github', 'create-issue');
        expect(tool).toBeDefined();
        expect(tool?.name).toBe('create-issue');
        expect(tool?.module).toBe('action');
        expect(tool?.output.length).toBeGreaterThan(0);
        expect(tool?.sdkVersion.endsWith('-zero')).toBe(true);
        expect(tool?.fileLocation).toBe('templates-zero/github/build/github_actions_create-issue.cjs');
        expect(tool?.sourceLocation).toBe('templates-zero/github/actions/create-issue.ts');
        expect(tool?.capabilities.usesRecords).toBe(false);
        expect(tool?.capabilities.usesOutbound).toBe(false);
        expect(tool?.capabilities.usesMetadata).toBe(false);
        expect(tool?.capabilities.usesInvoke).toBe(false);
        expect(typeof tool?.capabilities.usesCheckpoints).toBe('boolean');
        expect(tool).not.toHaveProperty('endpoint');
    });

    it('lists catalog tools for a provider and omits unknown providers', () => {
        const github = listCatalogTools('github');
        expect(github.some((tool) => tool.name === 'create-issue')).toBe(true);
        expect(listCatalogTools('this-provider-does-not-exist')).toEqual([]);
    });

    it('recognizes templates-zero paths', () => {
        expect(isTemplatesZeroPath('templates-zero/github/build/github_actions_create-issue.cjs')).toBe(true);
        expect(isTemplatesZeroPath('account/1/environment/1/config/2/create-issue-v1.js')).toBe(false);
    });

    it('resolves aliased providers to the canonical templates-zero folder', () => {
        const tool = getCatalogTool('airtable-pat', 'batch-create-records');
        expect(tool?.fileLocation).toBe('templates-zero/airtable/build/airtable_actions_batch-create-records.cjs');
        expect(tool?.sourceLocation).toBe('templates-zero/airtable/actions/batch-create-records.ts');
    });
});
